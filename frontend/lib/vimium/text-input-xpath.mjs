/**
 * Vimium `gi` / focusInput XPath from philc/vimium mode_normal.js textInputXPath.
 * Note: Vimium matches every `textarea` (no @readonly / @disabled filter).
 */
export const VIMIUM_TEXT_INPUT_XPATH =
  '//input[((@type="text" or @type="search" or @type="email" or @type="url" or @type="number" or @type="password" or @type="date" or @type="tel") or not(@type)) and not(@disabled or @readonly)] | //textarea | //*[@contenteditable="" or translate(@contenteditable, "TRUE", "true")="true"]';
