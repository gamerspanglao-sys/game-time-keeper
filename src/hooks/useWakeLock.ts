import { useState, useEffect, useCallback } from 'react';

export function useWakeLock(shouldKeepAwake: boolean) {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator && shouldKeepAwake) {
      try {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        console.log('Wake Lock activated');
      } catch (err) {
        console.log('Wake Lock error:', err);
      }
    }
  }, [shouldKeepAwake]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLock) {
      await wakeLock.release();
      setWakeLock(null);
      console.log('Wake Lock released');
    }
  }, [wakeLock]);

  useEffect(() => {
    if (shouldKeepAwake) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      releaseWakeLock();
    };
  }, [shouldKeepAwake]);

  // Re-acquire wake lock when page becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldKeepAwake) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [shouldKeepAwake, requestWakeLock]);

  return { isActive: !!wakeLock };
}
