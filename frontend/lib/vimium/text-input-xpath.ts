/**
 * Vimium `gi` / focusInput XPath (philc/vimium mode_normal.js textInputXPath).
 * Used by web smoke scripts to prove typed fields are detectable.
 */
export const VIMIUM_TEXT_INPUT_XPATH =
  '//input[(@type="text" or @type="search" or @type="email" or @type="url" or @type="number" or @type="password" or @type="date" or @type="tel" or not(@type)) and not(@disabled or @readonly)] | //textarea[not(@disabled or @readonly)] | //*[@contenteditable="true" and not(@disabled or @readonly)]';
