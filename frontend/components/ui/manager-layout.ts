/**
 * Shared sizing for manager page shells and CTAs.
 *
 * Density: stack sections with MANAGER_CONTENT_GAP only.
 * Do not add per-screen marginBottom between adjacent sections.
 */

/** Max width of the centered manager content column on wide viewports. */
export const MANAGER_CONTENT_MAX_WIDTH = 720;

/** Horizontal inset inside the manager content column. */
export const MANAGER_CONTENT_PADDING_X = 16;

/** Vertical gap between stacked manager sections (shared section gap). */
export const MANAGER_CONTENT_GAP = 12;

/** Vertical padding around the quiet manager page body. */
export const MANAGER_PAGE_PADDING_Y = 12;

/** Gap between page title and optional subtitle in quiet chrome. */
export const MANAGER_PAGE_HEADER_GAP = 4;

/** Padding inside a manager section chrome. */
export const MANAGER_SECTION_PADDING = 12;

/** Gap between section title and body. */
export const MANAGER_SECTION_GAP = 12;

/** Gap between title and actions, and between toolbar controls. */
export const MANAGER_SECTION_TOOLBAR_GAP = 8;

/** Default max width for primary/secondary manager CTAs. */
export const MANAGER_CTA_MAX_WIDTH = 280;

/** Minimum usable CTA width (narrow phones still keep a touch-friendly control). */
export const MANAGER_CTA_MIN_WIDTH = 140;

/** Minimum CTA height for touch targets. */
export const MANAGER_CTA_MIN_HEIGHT = 44;

/** Vertical padding inside a dense data list/table row (tighter than cards). */
export const MANAGER_DATA_ROW_PADDING_Y = 6;

/** Horizontal padding inside a dense data list/table row. */
export const MANAGER_DATA_ROW_PADDING_X = 8;

/** Vertical gap between dense data rows. */
export const MANAGER_DATA_ROW_GAP = 0;

/** Gap between aligned cells / actions inside a dense row. */
export const MANAGER_DATA_CELL_GAP = 8;

/**
 * Viewport width at or below which dense rows stack cells under the leading
 * column (native phones and narrow web). Wider viewports keep one band.
 */
export const MANAGER_DATA_STACK_BELOW = 560;
