/**
 * Universal Rich Content Paginator for SoilSync Learning Modules
 *
 * Divides long markdown, HTML, or EditorJS content into comfortable page-by-page chunks
 * based on estimated mobile scroll length (~1,400–1,600 characters ≈ 1–2 full scrolls).
 *
 * CRITICAL RULE: Never cuts in the middle of a paragraph, list item, or blockquote.
 * It is completely acceptable for a page to exceed the target character threshold to
 * keep the current paragraph whole and unbroken.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PaginationOptions {
  /** Target character length per page (default: 1500, ~1-2 full mobile screen scrolls) */
  targetPageLength?: number;
}

const DEFAULT_TARGET_LENGTH = 1500;
const MODULE_PAGE_STORAGE_PREFIX = '@soilsync_module_last_seen_page_';

/**
 * Retrieves the last read page index for a module from local on-device storage.
 * Completely local (offline) and does not touch any remote server.
 */
export async function getSavedModulePage(moduleId: string): Promise<number> {
  if (!moduleId) return 0;
  try {
    const value = await AsyncStorage.getItem(`${MODULE_PAGE_STORAGE_PREFIX}${moduleId}`);
    if (value !== null) {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
  } catch (error) {
    console.error('[contentPaginator] Error retrieving saved page:', error);
  }
  return 0;
}

/**
 * Saves the current page index for a module to local on-device storage.
 */
export async function saveModulePage(moduleId: string, pageIndex: number): Promise<void> {
  if (!moduleId || pageIndex < 0) return;
  try {
    await AsyncStorage.setItem(
      `${MODULE_PAGE_STORAGE_PREFIX}${moduleId}`,
      pageIndex.toString()
    );
  } catch (error) {
    console.error('[contentPaginator] Error saving last page:', error);
  }
}

const FONT_SIZE_STORAGE_KEY = '@soilsync_reading_font_size';

/**
 * Retrieves the user's preferred font size for reading & quizzes from local storage.
 */
export async function getSavedReadingFontSize(defaultSize: number = 18): Promise<number> {
  try {
    const value = await AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (value !== null) {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed >= 13 && parsed <= 26) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('[contentPaginator] Error retrieving saved font size:', error);
  }
  return defaultSize;
}

/**
 * Saves the user's preferred font size for reading & quizzes to local storage.
 */
export async function saveReadingFontSize(fontSize: number): Promise<void> {
  if (fontSize < 13 || fontSize > 26) return;
  try {
    await AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize.toString());
  } catch (error) {
    console.error('[contentPaginator] Error saving font size:', error);
  }
}

/**
 * Clears the saved page index for a module from local storage.
 */
export async function clearSavedModulePage(moduleId: string): Promise<void> {
  if (!moduleId) return;
  try {
    await AsyncStorage.removeItem(`${MODULE_PAGE_STORAGE_PREFIX}${moduleId}`);
  } catch (error) {
    console.error('[contentPaginator] Error clearing saved page:', error);
  }
}

/**
 * Checks if a discrete content block represents a heading
 */
function isHeadingBlock(block: string): boolean {
  const trimmed = block.trim();
  // Markdown heading: # Heading, ## Heading, etc.
  if (/^#{1,6}\s+/m.test(trimmed)) return true;
  // HTML heading: <h1>...</h1> to <h6>...</h6>
  if (/^<h[1-6][^>]*>/i.test(trimmed)) return true;
  return false;
}

/**
 * Extracts plain text length (ignoring HTML tags or markdown symbols) to accurately
 * measure how much reading space a block consumes on screen.
 */
function estimateVisualTextLength(block: string): number {
  if (!block) return 0;
  // Strip HTML tags
  const strippedHtml = block.replace(/<[^>]+>/g, '');
  // Strip markdown image syntax ![alt](url) -> alt
  const strippedImages = strippedHtml.replace(/!\[(.*?)\]\([^)]*\)/g, '$1');
  // Strip bold/italics markers
  const clean = strippedImages.replace(/[*_~`]/g, '').trim();
  return Math.max(clean.length, 30);
}

/**
 * Paginates EditorJS content ({ blocks: [...] })
 */
function paginateEditorJs(rawJson: string, targetLength: number): string[] | null {
  try {
    const parsed = JSON.parse(rawJson.trim());
    if (!parsed || !Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return null;
    }

    const pages: string[] = [];
    let currentBlocks: any[] = [];
    let currentLen = 0;

    for (let i = 0; i < parsed.blocks.length; i++) {
      const block = parsed.blocks[i];
      const blockText =
        block.data?.text ||
        (Array.isArray(block.data?.items) ? block.data.items.join(' ') : '') ||
        '';
      const blockLen = Math.max(blockText.length, 60);

      // Check if current page is full and we already have at least one block
      if (currentLen >= targetLength && currentBlocks.length > 0) {
        // Prevent orphan heading at the bottom of current page
        const lastBlock = currentBlocks[currentBlocks.length - 1];
        if (lastBlock.type === 'header' && currentBlocks.length > 1) {
          const poppedHeader = currentBlocks.pop();
          pages.push(JSON.stringify({ ...parsed, blocks: currentBlocks }));
          currentBlocks = [poppedHeader, block];
          currentLen = (poppedHeader.data?.text?.length || 50) + blockLen;
          continue;
        } else {
          pages.push(JSON.stringify({ ...parsed, blocks: currentBlocks }));
          currentBlocks = [];
          currentLen = 0;
        }
      }

      currentBlocks.push(block);
      currentLen += blockLen;
    }

    if (currentBlocks.length > 0) {
      pages.push(JSON.stringify({ ...parsed, blocks: currentBlocks }));
    }

    return pages.length > 0 ? pages : null;
  } catch {
    return null;
  }
}

/**
 * Paginates HTML formatted text by top-level block tags
 */
function paginateHtml(content: string, targetLength: number): string[] | null {
  // Check if content has recognizable HTML block tags
  const hasHtmlBlocks = /<(p|h[1-6]|ul|ol|blockquote|figure|div|section|table)[^>]*>/i.test(content);
  if (!hasHtmlBlocks) return null;

  // Match top-level blocks or self-closing tags
  const blockRegex =
    /<(p|h[1-6]|ul|ol|blockquote|figure|div|section|table)[^>]*>[\s\S]*?<\/\1>|<(?:hr|br|img)[^>]*\/?>/gi;

  const matches = content.match(blockRegex);
  if (!matches || matches.length <= 1) {
    return null;
  }

  const pages: string[] = [];
  let currentBlocks: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < matches.length; i++) {
    const block = matches[i].trim();
    if (!block) continue;
    const blockLen = estimateVisualTextLength(block);

    // If accumulated length reaches or exceeds target, start a new page
    if (currentLen >= targetLength && currentBlocks.length > 0) {
      const lastBlock = currentBlocks[currentBlocks.length - 1];
      if (isHeadingBlock(lastBlock) && currentBlocks.length > 1) {
        const poppedHeading = currentBlocks.pop()!;
        pages.push(currentBlocks.join('\n'));
        currentBlocks = [poppedHeading, block];
        currentLen = estimateVisualTextLength(poppedHeading) + blockLen;
        continue;
      } else {
        pages.push(currentBlocks.join('\n'));
        currentBlocks = [];
        currentLen = 0;
      }
    }

    currentBlocks.push(block);
    currentLen += blockLen;
  }

  if (currentBlocks.length > 0) {
    pages.push(currentBlocks.join('\n'));
  }

  return pages.length > 0 ? pages : null;
}

/**
 * Paginates Markdown / Plain Text by paragraph boundaries (double newlines)
 */
function paginateMarkdown(content: string, targetLength: number): string[] {
  // Normalize Windows/Unix newlines
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [''];

  // Normalize headings so they are guaranteed to sit on their own paragraph boundaries
  const withSpacedHeadings = normalized.replace(/(^|\n)(#{1,6}\s+[^\n]+)(?=\n|$)/g, '$1\n$2\n\n');

  // Split on double or multiple newlines
  const rawBlocks = withSpacedHeadings.split(/\n\s*\n+/);
  const blocks = rawBlocks.map((b) => b.trim()).filter((b) => b.length > 0);

  if (blocks.length === 0) return [normalized];

  // If the entire content is already shorter than target or is a single block
  const totalLength = blocks.reduce((acc, b) => acc + estimateVisualTextLength(b), 0);
  if (totalLength <= targetLength || blocks.length === 1) {
    return [blocks.join('\n\n')];
  }

  const pages: string[] = [];
  let currentBlocks: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockLen = estimateVisualTextLength(block);

    // If accumulated length reaches or exceeds target, close current page and begin next
    if (currentLen >= targetLength && currentBlocks.length > 0) {
      // Prevent orphan heading at the very bottom of the page
      const lastBlock = currentBlocks[currentBlocks.length - 1];
      if (isHeadingBlock(lastBlock) && currentBlocks.length > 1) {
        const poppedHeading = currentBlocks.pop()!;
        pages.push(currentBlocks.join('\n\n'));
        currentBlocks = [poppedHeading, block];
        currentLen = estimateVisualTextLength(poppedHeading) + blockLen;
        continue;
      } else {
        pages.push(currentBlocks.join('\n\n'));
        currentBlocks = [];
        currentLen = 0;
      }
    }

    currentBlocks.push(block);
    currentLen += blockLen;
  }

  if (currentBlocks.length > 0) {
    pages.push(currentBlocks.join('\n\n'));
  }

  return pages.length > 0 ? pages : [normalized];
}

/**
 * Main Entry Point: Paginates any learning module rich content without cutting paragraphs.
 *
 * @param content The raw module content (Markdown, HTML, or EditorJS JSON)
 * @param targetPageLength Target character length per page (default: 1500 chars ≈ 1-2 scrolls)
 * @returns Array of page content strings
 */
export function paginateRichContent(
  content: string | null | undefined,
  targetPageLength: number = DEFAULT_TARGET_LENGTH
): string[] {
  if (!content) return [''];
  const trimmed = content.trim();
  if (!trimmed) return [''];

  // 1. Check EditorJS JSON
  if (trimmed.startsWith('{') && trimmed.includes('"blocks"')) {
    const editorPages = paginateEditorJs(trimmed, targetPageLength);
    if (editorPages && editorPages.length > 0) {
      return editorPages;
    }
  }

  // 2. Check HTML blocks
  const htmlPages = paginateHtml(trimmed, targetPageLength);
  if (htmlPages && htmlPages.length > 0) {
    return htmlPages;
  }

  // 3. Fallback to Markdown / Plain text paragraph splitting
  return paginateMarkdown(trimmed, targetPageLength);
}
