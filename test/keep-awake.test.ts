import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepAwake } from '../src/lib/keepAwake';

// A just-enough browser: events, a video that can be told to refuse, and an optional wake lock.
function fakeBrowser(opts: { wakeLock?: 'ok' | 'refuse' | 'missing'; play?: 'ok' | 'refuse' }) {
  const docListeners = new Map<string, () => void>();
  const winListeners = new Map<string, () => void>();
  const video: any = {
    paused: true, style: {}, attrs: {} as Record<string, string>, removed: false, listeners: {} as Record<string, () => void>,
    setAttribute(k: string, v: string) { this.attrs[k] = v; },
    
    addEventListener(e: string, f: () => void) { this.listeners[e] = f; },
    pause() { this.paused = true; this.listeners.pause?.(); },
    remove() { this.removed = true; },
    async play() { if (opts.play === 'refuse') throw new Error('NotAllowedError'); this.paused = false; this.listeners.playing?.(); },
  };
  const sentinel = { release: vi.fn(async () => {}), addEventListener: vi.fn() };
  const request = vi.fn(async () => { if (opts.wakeLock === 'refuse') throw new Error('NotAllowedError'); return sentinel; });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    body: { appendChild: vi.fn() },
    createElement: () => video,
    addEventListener: (e: string, f: () => void) => docListeners.set(e, f),
    removeEventListener: (e: string) => docListeners.delete(e),
  });
  vi.stubGlobal('addEventListener', (e: string, f: () => void) => winListeners.set(e, f));
  vi.stubGlobal('removeEventListener', (e: string) => winListeners.delete(e));
  vi.stubGlobal('navigator', opts.wakeLock === 'missing' ? {} : { wakeLock: { request } });
  return { video, sentinel, request, winListeners, docListeners };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

describe('keeping the screen awake', () => {
  it('uses the wake lock when the browser grants it, with no video', async () => {
    const b = fakeBrowser({ wakeLock: 'ok' });
    const seen: boolean[] = [];
    const stop = keepAwake((h) => seen.push(h));
    await flush();
    expect(seen.at(-1)).toBe(true);
    expect(b.video.paused).toBe(true);
    stop();
    expect(b.sentinel.release).toHaveBeenCalled();
  });

  it('falls back to the silent video when the lock is refused, and cleans it up', async () => {
    const b = fakeBrowser({ wakeLock: 'refuse', play: 'ok' });
    const seen: boolean[] = [];
    const stop = keepAwake((h) => seen.push(h));
    await flush();
    expect(seen.at(-1)).toBe(true);
    expect(b.video.paused).toBe(false);
    expect(b.video.attrs.playsinline).toBe('');
    expect(b.video.loop).toBe(true);
    stop();
    expect(b.video.paused).toBe(true);
    expect(b.video.removed).toBe(true);
  });

  it('falls back to the video when the browser has no wake lock at all', async () => {
    const b = fakeBrowser({ wakeLock: 'missing', play: 'ok' });
    const seen: boolean[] = [];
    keepAwake((h) => seen.push(h));
    await flush();
    expect(seen.at(-1)).toBe(true);
    expect(b.video.paused).toBe(false);
  });

  it('reports not held when both are refused, then recovers on a tap', async () => {
    const b = fakeBrowser({ wakeLock: 'refuse', play: 'refuse' });
    const seen: boolean[] = [];
    keepAwake((h) => seen.push(h));
    await flush();
    expect(seen.at(-1)).toBe(false);
    b.request.mockImplementation(async () => b.sentinel);
    b.winListeners.get('pointerdown')!();
    await flush();
    expect(seen.at(-1)).toBe(true);
  });

  it('stops listening when stopped', async () => {
    const b = fakeBrowser({ wakeLock: 'ok' });
    const stop = keepAwake(() => {});
    await flush();
    stop();
    expect(b.winListeners.size).toBe(0);
    expect(b.docListeners.size).toBe(0);
  });
});
