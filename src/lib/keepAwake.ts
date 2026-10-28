/**
 * Keeps the screen on until the returned function is called, and tells `onChange` whether anything is really holding it awake (it may repeat the same answer).
 * The Screen Wake Lock API is tried first. Where it is missing or refused (some iPads, Low Power Mode), a silent looping video (mp4, which is
 * what Safari plays) stands in for it, which is the old NoSleep trick. If neither works the page can say so, and any tap tries again.
 */
export function keepAwake(onChange: (held: boolean) => void): () => void {
  let stopped = false;
  let lock: WakeLockSentinel | null = null;
  let video: HTMLVideoElement | null = null;

  const held = () => lock !== null || (video !== null && !video.paused);
  const report = () => onChange(held());

  const viaVideo = async () => {
    if (!video) {
      video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.tabIndex = -1;
      Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
      video.src = '/nosleep.mp4';
      video.addEventListener('playing', report);
      video.addEventListener('pause', report);
      document.body.appendChild(video);
    }
    try { await video.play(); } catch { /* refused until a tap, or the browser cannot play it */ }
  };

  const take = async () => {
    if (stopped || document.visibilityState !== 'visible') return;
    try {
      const got = (await navigator.wakeLock?.request('screen')) ?? null;
      if (stopped) { void got?.release().catch(() => {}); return; }
      if (got) {
        lock = got;
        got.addEventListener('release', () => { if (lock === got) { lock = null; report(); } });
        video?.pause();
      }
    } catch { /* refused: fall through to the video */ }
    if (!lock) await viaVideo();
    report();
  };

  const retry = () => { if (!held()) void take(); };
  document.addEventListener('visibilitychange', retry);
  addEventListener('pointerdown', retry);
  void take();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', retry);
    removeEventListener('pointerdown', retry);
    void lock?.release().catch(() => {});
    video?.pause();
    video?.remove();
  };
}
