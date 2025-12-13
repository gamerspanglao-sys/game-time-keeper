import { useRef, useCallback, useEffect } from 'react';

export function useTimerAlerts() {
  const activeAlarmsRef = useRef<Set<string>>(new Set());
  const titleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalTitle = useRef(document.title);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext - try to create eagerly
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('🔊 AudioContext created, state:', audioContextRef.current.state);
      } catch (e) {
        console.error('Failed to create AudioContext:', e);
      }
    }
    // Resume if suspended (required after user interaction)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        console.log('🔊 AudioContext resumed');
      }).catch(e => {
        console.error('Failed to resume AudioContext:', e);
      });
    }
    return audioContextRef.current;
  }, []);

  // Request notification permission and initialize audio on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Try to initialize audio context immediately
    ensureAudioContext();
    
    // Also initialize on any user interaction to handle browser restrictions
    const initAudio = () => {
      const ctx = ensureAudioContext();
      if (ctx && ctx.state === 'running') {
        console.log('🔊 Audio ready after user interaction');
        // Play a silent sound to fully unlock audio
        try {
          const oscillator = ctx.createOscillator();
          const gainNode = ctx.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(ctx.destination);
          gainNode.gain.value = 0; // Silent
          oscillator.start();
          oscillator.stop(ctx.currentTime + 0.001);
        } catch (e) {
          // Ignore
        }
      }
    };
    
    document.addEventListener('click', initAudio);
    document.addEventListener('touchstart', initAudio);
    document.addEventListener('keydown', initAudio);
    
    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('touchstart', initAudio);
      document.removeEventListener('keydown', initAudio);
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
    console.log('⚠️ playWarningBeep called for:', timerName, 'audioContext state:', audioContextRef.current?.state);
    try {
      const audioContext = ensureAudioContext();
      console.log('🔊 Playing warning beep, context state:', audioContext.state);
      
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
    console.log('🔔 playFinishedAlarm called for:', timerName, 'audioContext state:', audioContextRef.current?.state);
    
    if (activeAlarmsRef.current.has(timerId)) {
      console.log('Alarm already active for:', timerId);
      return;
    }
    
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
        
        // Ensure context is running
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        
        const now = audioContext.currentTime;
        
        // Play loud alarm - simple and reliable
        const playTone = (freq: number, delay: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = freq;
          oscillator.type = 'square';
          
          // Set gain immediately, then fade
          gainNode.gain.value = 1.0;
          
          const startTime = now + delay;
          oscillator.start(startTime);
          
          // Fade out
          gainNode.gain.setValueAtTime(1.0, startTime);
          gainNode.gain.linearRampToValueAtTime(0, startTime + 0.15);
          
          oscillator.stop(startTime + 0.2);
        };
        
        // Urgent alarm: high-low-high-low
        playTone(1200, 0);
        playTone(800, 0.2);
        playTone(1200, 0.4);
        playTone(800, 0.6);
        
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

  // Notify next person in queue
  const notifyQueueNext = useCallback((timerName: string, personName: string) => {
    try {
      const audioContext = ensureAudioContext();
      
      // Play friendly notification sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 523.25; // C5
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Play second tone
      setTimeout(() => {
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.frequency.value = 659.25; // E5
        osc2.type = 'sine';
        gain2.gain.setValueAtTime(0.4, audioContext.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        osc2.start(audioContext.currentTime);
        osc2.stop(audioContext.currentTime + 0.3);
      }, 150);
    } catch (e) {
      console.error('Error playing queue notification:', e);
    }

    // Send notification
    sendNotification(
      '🎮 Your Turn!',
      `${personName}, ${timerName} is now available!`,
      true
    );

    // Vibrate
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  }, [ensureAudioContext, sendNotification]);

  return {
    playWarningBeep,
    playFinishedAlarm,
    stopAlarm,
    stopAllAlarms,
    sendNotification,
    playConfirmSound,
    ensureAudioContext,
    notifyQueueNext,
  };
}
