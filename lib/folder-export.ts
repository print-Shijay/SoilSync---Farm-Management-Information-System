import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { AppAlert as Alert } from '../components/common/AppAlert';
import { FolderColumn, FolderRecordItem, UserFolderRecord } from './db-operations';
import { parseFolderImageValue, resolveImageBase64 } from './user-folder-storage';

export type ExportFormat = 'excel' | 'pdf' | 'word' | 'csv';

export interface ExportFolderOptions {
  folder: UserFolderRecord;
  columns: FolderColumn[];
  records: FolderRecordItem[];
  format: ExportFormat;
  deliveryMethod?: 'save' | 'share';
}

/**
 * Sanitizes filename string by removing illegal filesystem characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'table_export';
}

function safeFormatDateTime(rawVal: any): string {
  if (!rawVal) return '—';
  try {
    const d = new Date(rawVal);
    if (isNaN(d.getTime())) return String(rawVal);
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(rawVal);
  }
}

/**
 * Formats a value for text/tabular display
 */
function formatCellValue(col: FolderColumn, rawVal: any): string {
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return '—';
  }
  if (col.type === 'date') {
    const d = new Date(rawVal);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return String(rawVal);
  }
  if (col.type === 'number') {
    return Number(rawVal).toLocaleString();
  }
  if (col.type === 'image') {
    return String(rawVal);
  }
  return String(rawVal);
}

/**
 * Saves generated file directly to phone storage (via StorageAccessFramework on Android)
 * or shares it to other apps via the system share sheet.
 */
async function shareOrDownloadFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  dialogTitle: string,
  uti: string,
  deliveryMethod: 'save' | 'share' = 'save'
): Promise<void> {
  // On Android, if deliveryMethod is 'save', use StorageAccessFramework to save directly into phone storage (Downloads/Documents)
  if (Platform.OS === 'android' && deliveryMethod === 'save') {
    try {
      const { StorageAccessFramework } = FileSystem;
      let initialUri: string | null = null;
      try {
        initialUri = StorageAccessFramework.getUriForDirectoryInRoot('Download');
      } catch {}

      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
      if (permissions.granted) {
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const baseName = fileName.replace(/\.[^/.]+$/, '');
        const newFileUri = await StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          baseName,
          mimeType
        );

        await StorageAccessFramework.writeAsStringAsync(newFileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert(
          'Download Complete 📥',
          `"${fileName}" was saved directly to your phone's storage.`
        );
        return;
      }
      // If user cancelled folder picker, return cleanly
      return;
    } catch (safError: any) {
      console.warn('[Export] StorageAccessFramework error, falling back to share sheet:', safError);
    }
  }

  // iOS (where "Save to Files" is natively in the system sheet) or Android share fallback:
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    Alert.alert(
      'Export Complete',
      `File was saved to application storage at:\n${fileUri}\nSharing is not available on this device.`
    );
    return;
  }

  await Sharing.shareAsync(fileUri, {
    mimeType,
    dialogTitle,
    UTI: uti,
  });
}

/**
 * 1. EXCEL EXPORT (.xls) - Professional Styled Spreadsheet
 * Generates an Excel document with brand styling, zebra striping, and summary totals.
 * 100% pure React Native compatible with zero Node.js/Buffer dependencies.
 */
export async function exportToExcel(
  folder: UserFolderRecord,
  columns: FolderColumn[],
  records: FolderRecordItem[],
  deliveryMethod: 'save' | 'share' = 'save'
): Promise<string> {
  const numColumns = columns.length;
  const totalCols = Math.max(numColumns + 2, 4);

  const exportDateStr = new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const numericSums: Record<string, number> = {};
  columns.forEach((c) => {
    if (c.type === 'number') numericSums[c.id] = 0;
  });

  // Header Columns
  const headerColsHtml = columns
    .map(
      (c) => `
      <th style="background-color: #8C4522; color: #FFFFFF; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; font-weight: bold; padding: 8px 12px; border: 1px solid #5C2B14; text-align: ${
        c.type === 'number' ? 'right' : 'left'
      };">
        ${c.name}
        <span style="display:block; font-size: 8pt; font-weight: normal; opacity: 0.8; text-transform: uppercase;">
          ${c.type}
        </span>
      </th>
    `
    )
    .join('');

  // Data Rows
  const dataRowsHtml = records
    .map((rec, idx) => {
      const isEven = idx % 2 === 0;
      const bg = isEven ? '#FFFFFF' : '#FAF7F2';
      const indexBg = isEven ? '#FDF9F6' : '#F7F1EB';

      const loggedDate = safeFormatDateTime(rec.created_at);

      const cellsHtml = columns
        .map((col) => {
          const val = rec[col.id];
          const hasVal = val !== undefined && val !== null && val !== '';

          if (col.type === 'number') {
            const num = hasVal && !isNaN(Number(val)) ? Number(val) : null;
            if (num !== null) {
              numericSums[col.id] = (numericSums[col.id] || 0) + num;
            }
            return `
              <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: right; font-weight: bold; color: #733619;">
                ${num !== null ? num.toLocaleString() : ''}
              </td>
            `;
          }

          if (col.type === 'date') {
            return `
              <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center; color: #4A154B;">
                ${hasVal ? formatCellValue(col, val) : '—'}
              </td>
            `;
          }

          if (col.type === 'image') {
            const { localUri, cloudUrl } = parseFolderImageValue(val);
            const targetUrl = cloudUrl || (localUri?.startsWith('http') ? localUri : null);
            if (targetUrl) {
              return `
                <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center;">
                  <a href="${targetUrl}" style="color: #059669; font-weight: bold; text-decoration: underline;">📷 View Photo</a>
                </td>
              `;
            } else if (localUri) {
              return `
                <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center; color: #D97706; font-weight: bold;">
                  📷 [Local Photo Attached]
                </td>
              `;
            }
            return `
              <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center; color: #A09891; font-style: italic;">
                —
              </td>
            `;
          }

          return `
            <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: left; color: #1C120C;">
              ${hasVal ? String(val) : '—'}
            </td>
          `;
        })
        .join('');

      return `
        <tr>
          <td style="background-color: ${indexBg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center; font-weight: bold; color: #8C4522;">
            ${idx + 1}
          </td>
          <td style="background-color: ${bg}; border: 1px solid #E2DBD4; padding: 6px 10px; text-align: center; color: #615851;">
            ${loggedDate}
          </td>
          ${cellsHtml}
        </tr>
      `;
    })
    .join('');

  // Totals Row
  const totalCellsHtml = columns
    .map((col) => {
      if (col.type === 'number') {
        const sum = numericSums[col.id] || 0;
        return `
          <td style="background-color: #F0E8E1; border-top: 2px solid #8C4522; border-bottom: 3px double #8C4522; border-left: 1px solid #DDD5CD; border-right: 1px solid #DDD5CD; padding: 8px 10px; text-align: right; font-weight: bold; color: #733619;">
            ${sum.toLocaleString()}
          </td>
        `;
      }
      return `
        <td style="background-color: #F0E8E1; border-top: 2px solid #8C4522; border-bottom: 3px double #8C4522; border-left: 1px solid #DDD5CD; border-right: 1px solid #DDD5CD; padding: 8px 10px;"></td>
      `;
    })
    .join('');

  const sheetName = sanitizeFilename(folder.folder_name).slice(0, 31) || 'Records';

  const excelContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${sheetName}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
        </style>
      </head>
      <body>
        <table>
          <!-- 1. Title Banner -->
          <tr>
            <th colspan="${totalCols}" style="background-color: #8C4522; color: #FFFFFF; font-family: 'Segoe UI', Arial, sans-serif; font-size: 14pt; font-weight: bold; padding: 12px; text-align: center; border: 1px solid #733619;">
              🌱 SoilSync Records — ${folder.folder_name}
            </th>
          </tr>

          <!-- 2. Metadata Info -->
          <tr>
            <td style="background-color: #F5EFEB; font-weight: bold; color: #8C4522; border: 1px solid #DDD5CD; padding: 6px 10px;">Farm Location:</td>
            <td style="background-color: #F5EFEB; color: #1C120C; border: 1px solid #DDD5CD; padding: 6px 10px;">${folder.farm_name || 'Personal Records'}</td>
            <td style="background-color: #F5EFEB; font-weight: bold; color: #8C4522; border: 1px solid #DDD5CD; padding: 6px 10px;">Exported:</td>
            <td colspan="${totalCols - 3}" style="background-color: #F5EFEB; color: #1C120C; border: 1px solid #DDD5CD; padding: 6px 10px;">${exportDateStr}</td>
          </tr>
          <tr>
            <td style="background-color: #F5EFEB; font-weight: bold; color: #8C4522; border: 1px solid #DDD5CD; padding: 6px 10px;">Total Records:</td>
            <td style="background-color: #F5EFEB; color: #1C120C; border: 1px solid #DDD5CD; padding: 6px 10px;">${records.length}</td>
            <td style="background-color: #F5EFEB; font-weight: bold; color: #8C4522; border: 1px solid #DDD5CD; padding: 6px 10px;">Total Columns:</td>
            <td colspan="${totalCols - 3}" style="background-color: #F5EFEB; color: #1C120C; border: 1px solid #DDD5CD; padding: 6px 10px;">${columns.length}</td>
          </tr>

          <!-- Spacer -->
          <tr style="height: 10px;"><td colspan="${totalCols}"></td></tr>

          <!-- 3. Table Header -->
          <tr>
            <th style="background-color: #8C4522; color: #FFFFFF; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; font-weight: bold; padding: 8px 12px; border: 1px solid #5C2B14; text-align: center; width: 45px;">#</th>
            <th style="background-color: #8C4522; color: #FFFFFF; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; font-weight: bold; padding: 8px 12px; border: 1px solid #5C2B14; text-align: center; width: 140px;">Date Logged</th>
            ${headerColsHtml}
          </tr>

          <!-- 4. Data Rows -->
          ${dataRowsHtml}

          <!-- 5. Totals Footer -->
          <tr>
            <td style="background-color: #F0E8E1; border-top: 2px solid #8C4522; border-bottom: 3px double #8C4522; border-left: 1px solid #DDD5CD; border-right: 1px solid #DDD5CD; padding: 8px 10px; text-align: center; font-weight: bold; color: #8C4522;">TOTAL</td>
            <td style="background-color: #F0E8E1; border-top: 2px solid #8C4522; border-bottom: 3px double #8C4522; border-left: 1px solid #DDD5CD; border-right: 1px solid #DDD5CD; padding: 8px 10px; text-align: center; font-weight: bold; color: #5C2B14;">${records.length} Records</td>
            ${totalCellsHtml}
          </tr>
        </table>
      </body>
    </html>
  `;

  const safeName = sanitizeFilename(folder.folder_name);
  const fileName = `${safeName}_${Date.now()}.xls`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, excelContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await shareOrDownloadFile(
    fileUri,
    fileName,
    'application/vnd.ms-excel',
    `Download ${folder.folder_name} (Excel)`,
    'com.microsoft.excel.xls',
    deliveryMethod
  );

  return fileUri;
}

/**
 * 2. PDF EXPORT (.pdf)
 */
export async function exportToPdf(
  folder: UserFolderRecord,
  columns: FolderColumn[],
  records: FolderRecordItem[],
  deliveryMethod: 'save' | 'share' = 'save'
): Promise<string> {
  // Pre-fetch/encode all photos as base64 data URIs so they are embedded directly in PDF
  const photoBase64Map: Record<string, string | null> = {};
  for (const rec of records) {
    for (const col of columns) {
      if (col.type === 'image') {
        photoBase64Map[`${rec.id}_${col.id}`] = await resolveImageBase64(rec[col.id]);
      }
    }
  }

  const exportDateStr = new Date().toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Generate HTML table headers
  const headerHtml = `
    <tr>
      <th style="width: 45px; text-align: center;">#</th>
      <th style="width: 120px;">Date Logged</th>
      ${columns
        .map(
          (c) => `
        <th style="text-align: ${c.type === 'number' ? 'right' : 'left'};">
          ${c.name}
          <span style="display:block; font-size: 8px; font-weight: 500; opacity: 0.7; text-transform: uppercase;">
            ${c.type}
          </span>
        </th>
      `
        )
        .join('')}
    </tr>
  `;

  // Generate HTML table rows
  const rowsHtml = records
    .map((rec, idx) => {
      const loggedDate = safeFormatDateTime(rec.created_at);

      const colsHtml = columns
        .map((col) => {
          const val = rec[col.id];
          const hasVal = val !== undefined && val !== null && val !== '';

          if (col.type === 'image') {
            const base64Uri = photoBase64Map[`${rec.id}_${col.id}`];
            if (base64Uri) {
              return `
                <td style="text-align: center; vertical-align: middle; padding: 4px;">
                  <img src="${base64Uri}" alt="Photo" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1.5px solid #8C4522; box-shadow: 0 1px 3px rgba(0,0,0,0.12);" />
                </td>
              `;
            }
            return `<td style="text-align: center; color: #A09891; font-style: italic; font-size: 10px;">—</td>`;
          }

          if (col.type === 'number') {
            return `
              <td style="text-align: right; font-weight: 600; color: #8C4522;">
                ${hasVal ? Number(val).toLocaleString() : '—'}
              </td>
            `;
          }

          if (col.type === 'date') {
            return `
              <td style="color: #4A154B; font-weight: 500;">
                ${hasVal ? formatCellValue(col, val) : '—'}
              </td>
            `;
          }

          return `
            <td style="color: #1C120C;">
              ${hasVal ? String(val) : '—'}
            </td>
          `;
        })
        .join('');

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#FAF7F2'};">
          <td style="text-align: center; font-weight: 700; color: #8C4522;">${idx + 1}</td>
          <td style="font-size: 10px; color: #736B66;">${loggedDate}</td>
          ${colsHtml}
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${folder.folder_name} - SoilSync Export</title>
        <style>
          @page {
            margin: 18mm 12mm 18mm 12mm;
            size: A4 landscape;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1C120C;
            margin: 0;
            padding: 0;
            background: #FFFFFF;
            font-size: 11px;
            line-height: 1.4;
          }
          .header-banner {
            border-bottom: 2px solid #8C4522;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .brand-title {
            font-size: 20px;
            font-weight: 900;
            color: #1C120C;
            letter-spacing: -0.5px;
            margin: 0;
          }
          .folder-title {
            font-size: 16px;
            font-weight: 800;
            color: #8C4522;
            margin: 4px 0 0 0;
          }
          .meta-box {
            text-align: right;
            font-size: 10px;
            color: #736B66;
          }
          .pill {
            display: inline-block;
            background-color: #F5EFEB;
            color: #8C4522;
            padding: 3px 8px;
            border-radius: 12px;
            font-weight: 700;
            font-size: 10px;
            margin-bottom: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          th {
            background-color: #8C4522;
            color: #FFFFFF;
            padding: 8px 10px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border: 1px solid #733619;
          }
          td {
            padding: 7px 10px;
            border: 1px solid #EBE5DF;
            font-size: 11px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #EBE5DF;
            font-size: 9px;
            color: #A09891;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="header-banner">
          <div>
            <div class="brand-title">🌱 SoilSync Records</div>
            <div class="folder-title">${folder.folder_name}</div>
          </div>
          <div class="meta-box">
            ${folder.farm_name ? `<div class="pill">📍 ${folder.farm_name}</div><br/>` : ''}
            <div><strong>Export Date:</strong> ${exportDateStr}</div>
            <div><strong>Total Records:</strong> ${records.length}</div>
          </div>
        </div>

        <table>
          <thead>
            ${headerHtml}
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Generated securely on mobile via SoilSync Application</div>
          <div>Page 1 of 1</div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  const safeName = sanitizeFilename(folder.folder_name);
  const fileName = `${safeName}_${Date.now()}.pdf`;

  await shareOrDownloadFile(
    uri,
    fileName,
    'application/pdf',
    `Download ${folder.folder_name} (PDF)`,
    'com.adobe.pdf',
    deliveryMethod
  );

  return uri;
}

/**
 * 3. WORD DOCUMENT EXPORT (.doc)
 * Generates an OpenXML/HTML-based Word document with native table and font styling
 * perfectly recognized and editable in Microsoft Word, Google Docs, and WPS Office.
 */
export async function exportToWord(
  folder: UserFolderRecord,
  columns: FolderColumn[],
  records: FolderRecordItem[],
  deliveryMethod: 'save' | 'share' = 'save'
): Promise<string> {
  // Pre-fetch/encode all photos as base64 data URIs so they are embedded directly in Word
  const photoBase64Map: Record<string, string | null> = {};
  for (const rec of records) {
    for (const col of columns) {
      if (col.type === 'image') {
        photoBase64Map[`${rec.id}_${col.id}`] = await resolveImageBase64(rec[col.id]);
      }
    }
  }

  const exportDateStr = new Date().toLocaleString();

  const tableHeaderHtml = `
    <tr style="background-color: #8C4522; color: #FFFFFF;">
      <th style="border: 1px solid #8C4522; padding: 8px; font-weight: bold; width: 40px; text-align: center;">#</th>
      <th style="border: 1px solid #8C4522; padding: 8px; font-weight: bold; width: 120px; text-align: left;">Date Logged</th>
      ${columns
        .map(
          (c) => `
        <th style="border: 1px solid #8C4522; padding: 8px; font-weight: bold; text-align: ${
          c.type === 'number' ? 'right' : 'left'
        };">
          ${c.name}
        </th>
      `
        )
        .join('')}
    </tr>
  `;

  const tableRowsHtml = records
    .map((rec, idx) => {
      const loggedDate = safeFormatDateTime(rec.created_at);

      const cells = columns
        .map((col) => {
          const val = rec[col.id];
          const hasVal = val !== undefined && val !== null && val !== '';
          const align = col.type === 'number' ? 'right' : 'left';

          if (col.type === 'image') {
            const base64Uri = photoBase64Map[`${rec.id}_${col.id}`];
            if (base64Uri) {
              return `
                <td style="border: 1px solid #D1C7BD; padding: 4px; text-align: center; vertical-align: middle;">
                  <img src="${base64Uri}" width="54" height="54" style="object-fit: cover; border-radius: 6px; border: 1px solid #8C4522;" />
                </td>
              `;
            }
            return `<td style="border: 1px solid #D1C7BD; padding: 6px 8px; text-align: center; color: #A09891; font-style: italic;">—</td>`;
          }

          return `
            <td style="border: 1px solid #D1C7BD; padding: 6px 8px; text-align: ${align};">
              ${hasVal ? (col.type === 'number' ? Number(val).toLocaleString() : String(val)) : '—'}
            </td>
          `;
        })
        .join('');

      const bg = idx % 2 === 0 ? '#FFFFFF' : '#FAF7F2';

      return `
        <tr style="background-color: ${bg};">
          <td style="border: 1px solid #D1C7BD; padding: 6px 8px; text-align: center; font-weight: bold; color: #8C4522;">
            ${idx + 1}
          </td>
          <td style="border: 1px solid #D1C7BD; padding: 6px 8px; color: #736B66; font-size: 10pt;">
            ${loggedDate}
          </td>
          ${cells}
        </tr>
      `;
    })
    .join('');

  const wordContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <meta charset="utf-8">
        <title>${folder.folder_name}</title>
        <style>
          body {
            font-family: Calibri, Arial, sans-serif;
            font-size: 11pt;
            color: #1C120C;
          }
          h1 {
            color: #1C120C;
            font-size: 20pt;
            margin-bottom: 2pt;
          }
          h2 {
            color: #8C4522;
            font-size: 14pt;
            margin-top: 0;
            margin-bottom: 12pt;
          }
          p.meta {
            color: #736B66;
            font-size: 10pt;
            margin: 2pt 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-top: 14pt;
          }
        </style>
      </head>
      <body>
        <h1>SoilSync Folder Records</h1>
        <h2>${folder.folder_name}</h2>
        ${folder.farm_name ? `<p class="meta"><strong>Farm Location:</strong> ${folder.farm_name}</p>` : ''}
        <p class="meta"><strong>Export Date:</strong> ${exportDateStr}</p>
        <p class="meta"><strong>Total Records:</strong> ${records.length}</p>
        <hr style="border: 0; border-top: 1.5pt solid #8C4522; margin: 10pt 0 14pt 0;" />

        <table>
          <thead>
            ${tableHeaderHtml}
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const safeName = sanitizeFilename(folder.folder_name);
  const fileName = `${safeName}_${Date.now()}.doc`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, wordContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await shareOrDownloadFile(
    fileUri,
    fileName,
    'application/msword',
    `Download ${folder.folder_name} (Word)`,
    'com.microsoft.word.doc',
    deliveryMethod
  );

  return fileUri;
}

/**
 * 4. CSV EXPORT (.csv)
 */
export async function exportToCsv(
  folder: UserFolderRecord,
  columns: FolderColumn[],
  records: FolderRecordItem[],
  deliveryMethod: 'save' | 'share' = 'save'
): Promise<string> {
  const escapeCsv = (str: any): string => {
    if (str === undefined || str === null) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines: string[] = [];

  // Headers
  const header = ['#', 'Date Logged', ...columns.map((c) => c.name)];
  lines.push(header.map(escapeCsv).join(','));

  // Rows
  records.forEach((rec, idx) => {
    let loggedDate = '—';
    try {
      const d = new Date(rec.created_at);
      if (!isNaN(d.getTime())) {
        loggedDate = d.toISOString();
      }
    } catch {}
    const row = [idx + 1, loggedDate];

    columns.forEach((col) => {
      const val = rec[col.id];
      if (col.type === 'image') {
        const { cloudUrl, bestUri } = parseFolderImageValue(val);
        row.push(cloudUrl || (bestUri ? '[Photo Attached]' : ''));
      } else {
        row.push(val !== undefined && val !== null ? val : '');
      }
    });

    lines.push(row.map(escapeCsv).join(','));
  });

  const csvContent = lines.join('\r\n');
  const safeName = sanitizeFilename(folder.folder_name);
  const fileName = `${safeName}_${Date.now()}.csv`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await shareOrDownloadFile(
    fileUri,
    fileName,
    'text/csv',
    `Download ${folder.folder_name} (CSV)`,
    'public.comma-separated-values-text',
    deliveryMethod
  );

  return fileUri;
}

/**
 * Master export handler
 */
export async function exportFolderTable(options: ExportFolderOptions): Promise<string> {
  const { folder, columns, records, format, deliveryMethod = 'save' } = options;

  if (records.length === 0) {
    throw new Error('This folder has no records to export yet.');
  }

  if (columns.length === 0) {
    throw new Error('This folder has no columns defined yet.');
  }

  switch (format) {
    case 'excel':
      return await exportToExcel(folder, columns, records, deliveryMethod);
    case 'pdf':
      return await exportToPdf(folder, columns, records, deliveryMethod);
    case 'word':
      return await exportToWord(folder, columns, records, deliveryMethod);
    case 'csv':
      return await exportToCsv(folder, columns, records, deliveryMethod);
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }
}
