/** Shared presentation primitives. Dialog owners retain pause, focus and close lifecycle. */
export const MODAL_PARTS = Object.freeze({
  overlay: 'game-modal', panel: 'game-modal-panel', heading: 'game-modal-heading',
  close: 'game-modal-close', button: 'game-modal-button', scroll: 'game-modal-scroll',
});
export function modalPart(part, extra = '') {
  if (!Object.hasOwn(MODAL_PARTS, part)) throw new TypeError(`Unknown modal part: ${part}`);
  return `${MODAL_PARTS[part]}${extra ? ` ${extra}` : ''}`;
}
