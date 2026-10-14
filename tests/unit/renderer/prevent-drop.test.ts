import { describe, it, expect } from 'vitest';
import { preventFileDrop } from '../../../src/renderer/lib/prevent-drop';

describe('preventFileDrop', () => {
  it('cancels dragover and drop so a dropped file never navigates the window', () => {
    const target = new EventTarget();
    preventFileDrop(target as unknown as Window);
    for (const type of ['dragover', 'drop']) {
      const event = new Event(type, { cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});
