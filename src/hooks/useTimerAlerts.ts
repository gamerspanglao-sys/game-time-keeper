import { useRef, useCallback, useEffect } from 'react';

export function useTimerAlerts() {
  const warningAudioRef = useRef<AudioContext | null>(null);
  const finishedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeAlarmsRef = useRef<Set<string>>(new Set());

  const playWarningBeep = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
      console.error('Error playing warning beep:', e);
    }
  }, []);

  const playFinishedAlarm = useCallback((timerId: string) => {
    if (activeAlarmsRef.current.has(timerId)) return;
    
    activeAlarmsRef.current.add(timerId);
    
    const playBeep = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 1000;
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        console.error('Error playing finished alarm:', e);
      }
    };

    playBeep();
    const intervalId = setInterval(playBeep, 1000);
    
    // Store interval ID associated with timerId
    const intervalKey = `alarm_${timerId}`;
    (window as any)[intervalKey] = intervalId;
  }, []);

  const stopAlarm = useCallback((timerId: string) => {
    activeAlarmsRef.current.delete(timerId);
    const intervalKey = `alarm_${timerId}`;
    const intervalId = (window as any)[intervalKey];
    if (intervalId) {
      clearInterval(intervalId);
      delete (window as any)[intervalKey];
    }
  }, []);

  const stopAllAlarms = useCallback(() => {
    activeAlarmsRef.current.forEach(timerId => {
      stopAlarm(timerId);
    });
    activeAlarmsRef.current.clear();
  }, [stopAlarm]);

  useEffect(() => {
    return () => {
      stopAllAlarms();
    };
  }, [stopAllAlarms]);

  return {
    playWarningBeep,
    playFinishedAlarm,
    stopAlarm,
    stopAllAlarms,
  };
}
