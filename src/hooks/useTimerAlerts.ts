import { useRef, useCallback, useEffect } from 'react';

export function useTimerAlerts() {
  const activeAlarmsRef = useRef<Set<string>>(new Set());
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalTitle = useRef(document.title);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = useCallback((title: string, body: string, requireInteraction = false) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.ico',
        requireInteraction,
        tag: 'timer-alert',
      });
      
      // Vibrate on mobile if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
      
      return notification;
    }
    return null;
  }, []);

  const flashTitle = useCallback((message: string) => {
    if (titleIntervalRef.current) return;
    
    let isOriginal = true;
    titleIntervalRef.current = setInterval(() => {
      document.title = isOriginal ? `🚨 ${message}` : originalTitle.current;
      isOriginal = !isOriginal;
    }, 500);
  }, []);

  const stopFlashTitle = useCallback(() => {
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
      document.title = originalTitle.current;
    }
  }, []);

  const playWarningBeep = useCallback((timerName?: string) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.8);
      
      // Send notification for warning
      if (timerName) {
        sendNotification(
          '⚠️ Timer Warning!', 
          `${timerName} - Only 5 minutes left!`,
          false
        );
      }
    } catch (e) {
      console.error('Error playing warning beep:', e);
    }
  }, [sendNotification]);

  const playFinishedAlarm = useCallback((timerId: string, timerName?: string) => {
    if (activeAlarmsRef.current.has(timerId)) return;
    
    activeAlarmsRef.current.add(timerId);
    
    // Flash title
    flashTitle(timerName ? `${timerName} FINISHED!` : 'TIMER FINISHED!');
    
    // Send persistent notification
    if (timerName) {
      sendNotification(
        '🔴 TIME IS UP!', 
        `${timerName} has finished! Please attend to this immediately.`,
        true // requireInteraction - notification won't auto-dismiss
      );
    }
    
    const playBeep = () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Play a more attention-grabbing alarm pattern
        const playTone = (freq: number, startTime: number, duration: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = freq;
          oscillator.type = 'square';
          
          gainNode.gain.setValueAtTime(0.6, audioContext.currentTime + startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
          
          oscillator.start(audioContext.currentTime + startTime);
          oscillator.stop(audioContext.currentTime + startTime + duration);
        };
        
        // Alarm pattern: high-low-high
        playTone(1200, 0, 0.15);
        playTone(800, 0.2, 0.15);
        playTone(1200, 0.4, 0.15);
        
        // Vibrate on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100, 50, 100]);
        }
      } catch (e) {
        console.error('Error playing finished alarm:', e);
      }
    };

    playBeep();
    const intervalId = setInterval(playBeep, 800); // More frequent alarm
    
    // Store interval ID associated with timerId
    const intervalKey = `alarm_${timerId}`;
    (window as any)[intervalKey] = intervalId;
  }, [flashTitle, sendNotification]);

  const stopAlarm = useCallback((timerId: string) => {
    activeAlarmsRef.current.delete(timerId);
    const intervalKey = `alarm_${timerId}`;
    const intervalId = (window as any)[intervalKey];
    if (intervalId) {
      clearInterval(intervalId);
      delete (window as any)[intervalKey];
    }
    
    // Stop title flashing if no more active alarms
    if (activeAlarmsRef.current.size === 0) {
      stopFlashTitle();
    }
  }, [stopFlashTitle]);

  const stopAllAlarms = useCallback(() => {
    activeAlarmsRef.current.forEach(timerId => {
      stopAlarm(timerId);
    });
    activeAlarmsRef.current.clear();
    stopFlashTitle();
  }, [stopAlarm, stopFlashTitle]);

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
    sendNotification,
  };
}
