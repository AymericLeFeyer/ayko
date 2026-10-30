import { useEffect, useState } from 'react';

const SHIFT_MS = 60_000;
const SHIFT_PX = 6;

/** Keeps the screen on. Needs HTTPS or localhost; elsewhere the browser refuses quietly. */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        ?.request('screen')
        .then((sentinel) => {
          lock = sentinel;
        })
        .catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, []);
}

/** A minute clock, for the display and for the night window. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Small periodic offset of fixed elements, against screen burn-in. */
export function useBurnInShift() {
  const [shift, setShift] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const random = () => Math.round((Math.random() - 0.5) * 2 * SHIFT_PX);
    const timer = setInterval(() => setShift({ x: random(), y: random() }), SHIFT_MS);
    return () => clearInterval(timer);
  }, []);
  return shift;
}

export function enterFullscreen() {
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  }
}
