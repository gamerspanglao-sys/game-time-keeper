import { useRef, useCallback, useEffect } from 'react';

export function useTimerAlerts() {
  const activeAlarmsRef = useRef<Set<string>>(new Set());
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalTitle = useRef(document.title);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext on first user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (required after user interaction)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Initialize audio context on any user interaction
    const initAudio = () => {
      ensureAudioContext();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);
    
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, [ensureAudioContext]);

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
      const audioContext = ensureAudioContext();
      
      // Play 3 beeps for warning
      for (let i = 0; i < 3; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        
        const startTime = audioContext.currentTime + i * 0.3;
        gainNode.gain.setValueAtTime(0.5, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
      }
      
      // Send notification for warning
      if (timerName) {
        sendNotification(
          '⚠️ Timer Warning!', 
          `${timerName} - Only 5 minutes left!`,
          false
        );
      }
      
      // Vibrate
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 100]);
      }
    } catch (e) {
      console.error('Error playing warning beep:', e);
    }
  }, [ensureAudioContext, sendNotification]);

  const playFinishedAlarm = useCallback((timerId: string, timerName?: string) => {
    if (activeAlarmsRef.current.has(timerId)) return;
    
    activeAlarmsRef.current.add(timerId);
    
    // Flash title
    flashTitle(timerName ? `${timerName} FINISHED!` : 'TIMER FINISHED!');
    
    // Send persistent notification
    const sendReminderNotification = () => {
      if (timerName) {
        sendNotification(
          '🔴 TIME IS UP!', 
          `${timerName} has finished! Please attend to this immediately.`,
          true
        );
      }
    };
    
    sendReminderNotification();
    
    const playBeep = () => {
      try {
        const audioContext = ensureAudioContext();
        
        // Play loud alarm pattern
        const playTone = (freq: number, startTime: number, duration: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = freq;
          oscillator.type = 'square';
          
          gainNode.gain.setValueAtTime(0.8, audioContext.currentTime + startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + duration);
          
          oscillator.start(audioContext.currentTime + startTime);
          oscillator.stop(audioContext.currentTime + startTime + duration);
        };
        
        // Urgent alarm pattern: high-low-high-low (louder)
        playTone(1200, 0, 0.15);
        playTone(800, 0.2, 0.15);
        playTone(1200, 0.4, 0.15);
        playTone(800, 0.6, 0.15);
        
        // Vibrate on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200, 100, 200]);
        }
      } catch (e) {
        console.error('Error playing finished alarm:', e);
      }
    };

    playBeep();
    
    // Continuous alarm every 700ms
    const alarmIntervalId = setInterval(playBeep, 700);
    const alarmKey = `alarm_${timerId}`;
    (window as any)[alarmKey] = alarmIntervalId;
    
    // Reminder notification every 30 seconds
    const reminderIntervalId = setInterval(() => {
      sendReminderNotification();
      // Also play louder beeps for reminder
      playBeep();
    }, 30000);
    const reminderKey = `reminder_${timerId}`;
    (window as any)[reminderKey] = reminderIntervalId;
  }, [ensureAudioContext, flashTitle, sendNotification]);

  const stopAlarm = useCallback((timerId: string) => {
    activeAlarmsRef.current.delete(timerId);
    
    // Stop alarm interval
    const alarmKey = `alarm_${timerId}`;
    const alarmIntervalId = (window as any)[alarmKey];
    if (alarmIntervalId) {
      clearInterval(alarmIntervalId);
      delete (window as any)[alarmKey];
    }
    
    // Stop reminder interval
    const reminderKey = `reminder_${timerId}`;
    const reminderIntervalId = (window as any)[reminderKey];
    if (reminderIntervalId) {
      clearInterval(reminderIntervalId);
      delete (window as any)[reminderKey];
    }
    
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

  // Play a confirmation sound
  const playConfirmSound = useCallback(() => {
    try {
      const audioContext = ensureAudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
      console.error('Error playing confirm sound:', e);
    }
  }, [ensureAudioContext]);

  useEffect(() => {
    return () => {
      stopAllAlarms();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAllAlarms]);

  return {
    playWarningBeep,
    playFinishedAlarm,
    stopAlarm,
    stopAllAlarms,
    sendNotification,
    playConfirmSound,
    ensureAudioContext,
  };
}
