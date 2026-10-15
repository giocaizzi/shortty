/**
 * A file dropped on a window would navigate it to that file (the main process
 * blocks the navigation too). No view accepts drops, so cancel them all.
 */
export function preventFileDrop(target: Pick<Window, 'addEventListener'> = window): void {
  for (const type of ['dragover', 'drop'] as const) {
    target.addEventListener(type, (event) => event.preventDefault());
  }
}
