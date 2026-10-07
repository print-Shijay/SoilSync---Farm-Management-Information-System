import { powersync } from './powersync';

export type PendingUploadItem = {
  id: number;
  table: string;
  op: 'PUT' | 'PATCH' | 'DELETE' | string;
  recordId?: string;
  label: string;
  operationText: string;
  details?: string;
};

export type PendingUploadSummary = {
  count: number;
  items: PendingUploadItem[];
  tableCounts: Record<string, number>;
};

const TABLE_DISPLAY_LABELS: Record<string, string> = {
  farms: 'Farm Information',
  farm_layouts: 'Farm Blueprint & Layout',
  garden_structures: 'Garden Structure',
  crop_cycles: 'Crop Cycle & Schedule',
  todos: 'Farm Task / Todo',
  farm_succession_plans: 'Succession Plan',
  farm_checkup_results: 'Farm Health Checkup',
  teams: 'Team / Group',
  team_members: 'Team Member Invitation',
  team_farms: 'Team Farm Assignment',
  team_folders: 'Team Folder Assignment',
  folder_audit_logs: 'Folder Activity Log',
  audit_logs: 'Activity Audit Log',
  user_sms_settings: 'SMS Notification Settings',
  users: 'User Profile Settings',
};

export async function getPendingUploadDetails(): Promise<PendingUploadSummary> {
  try {
    const stats = await powersync.getUploadQueueStats();
    if (stats.count === 0) {
      return { count: 0, items: [], tableCounts: {} };
    }

    // Query PowerSync internal SQLite queue table (ps_crud)
    const rows = await powersync.getAll<{ id: number; tx_id: number; data: string }>(
      'SELECT id, tx_id, data FROM ps_crud ORDER BY id ASC LIMIT 50'
    );

    const tableCounts: Record<string, number> = {};
    const items: PendingUploadItem[] = rows.map((row) => {
      try {
        const parsed = JSON.parse(row.data);
        const table = (parsed.table || 'unknown').toLowerCase();
        const op = parsed.op || 'WRITE';
        const recordId = parsed.id || '';

        tableCounts[table] = (tableCounts[table] || 0) + 1;

        const label = TABLE_DISPLAY_LABELS[table] || table.replace(/_/g, ' ');
        let operationText = 'Modified';
        if (op === 'PUT' || op === 1) operationText = 'New / Overwritten';
        else if (op === 'PATCH' || op === 2) operationText = 'Updated';
        else if (op === 'DELETE' || op === 3) operationText = 'Deleted';

        let details = `ID: ${recordId ? recordId.substring(0, 8) + '...' : row.id}`;
        if (parsed.opData && typeof parsed.opData === 'object') {
          if (parsed.opData.title) details = `Task: "${parsed.opData.title}"`;
          else if (parsed.opData.farm_name) details = `Farm: "${parsed.opData.farm_name}"`;
          else if (parsed.opData.label) details = `Structure: "${parsed.opData.label}"`;
        }

        return {
          id: row.id,
          table,
          op: String(op),
          recordId,
          label,
          operationText,
          details,
        };
      } catch {
        const table = 'unknown';
        tableCounts[table] = (tableCounts[table] || 0) + 1;
        return {
          id: row.id,
          table,
          op: 'UNKNOWN',
          label: 'Uncategorized Change',
          operationText: 'Pending',
          details: `Entry #${row.id}`,
        };
      }
    });

    return {
      count: stats.count,
      items,
      tableCounts,
    };
  } catch (error) {
    console.warn('[PendingUploads] Failed to retrieve pending upload details:', error);
    return { count: 0, items: [], tableCounts: {} };
  }
}

export async function submitProblemReport(params: {
  userId?: string;
  userEmail?: string;
  category: string;
  description: string;
  pendingUploadCount: number;
  pendingTables: string[];
}) {
  try {
    const reportData = {
      timestamp: new Date().toISOString(),
      user_id: params.userId || 'anonymous',
      user_email: params.userEmail || 'unknown',
      category: params.category,
      description: params.description,
      pending_upload_count: params.pendingUploadCount,
      pending_tables: params.pendingTables,
      app_version: '2.0.0',
    };

    console.log('[ProblemReport] Submitting user issue report:', reportData);

    // Save to local SQLite audit_logs or console report log
    try {
      await powersync.execute(
        `INSERT INTO audit_logs (id, farm_id, farm_owner_id, user_id, action, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
          'system',
          params.userId || 'system',
          params.userId || 'system',
          `PROBLEM_REPORT_${params.category.toUpperCase().replace(/\s+/g, '_')}`,
          JSON.stringify(reportData),
          new Date().toISOString(),
        ]
      );
    } catch (e) {
      console.warn('[ProblemReport] Could not write audit log locally:', e);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[ProblemReport] Failed to submit problem report:', error);
    return { success: false, error: error?.message || 'Failed to submit report' };
  }
}
