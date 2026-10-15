/**
 * True while an input method (Japanese, Chinese, Korean, ...) is composing
 * text: Enter commits the composition and arrows pick a candidate, so key
 * handlers must leave those keys to the IME. Safari and older Chromium
 * report the commit keydown only as keyCode 229, hence both checks.
 */
export function isImeComposing(e: { nativeEvent: KeyboardEvent; keyCode: number }): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}
