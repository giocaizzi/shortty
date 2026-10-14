/**
 * Two-phase hide for the launcher so the renderer can play its exit animation
 * (docs/spec.md §10.9): `hide()` asks the renderer to animate out (`requestExit`),
 * then really hides once the renderer acknowledges or `timeoutMs` elapses,
 * whichever comes first. `cancel()` aborts a pending hide (the window is being
 * shown again). Acks for an older request are ignored.
 */
export interface WindowHiderDeps {
  requestExit: (id: number) => void;
  hide: () => void;
  timeoutMs: number;
}

export class WindowHider {
  private pending: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private nextId = 1;

  constructor(private readonly deps: WindowHiderDeps) {}

  get hiding(): boolean {
    return this.pending !== null;
  }

  hide(): void {
    if (this.pending) return;
    const id = this.nextId++;
    const timer = setTimeout(() => this.finish(id), this.deps.timeoutMs);
    this.pending = { id, timer };
    this.deps.requestExit(id);
  }

  ack(id: number): void {
    this.finish(id);
  }

  cancel(): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private finish(id: number): void {
    if (this.pending?.id !== id) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
    this.deps.hide();
  }
}
