import { useState, useEffect, useCallback, useRef } from 'react';
import { Timer, ActivityLogEntry } from '@/types/timer';
import {
  loadTimers,
  saveTimers,
  loadActivityLog,
  addActivityLogEntry,
  updateDailyStats,
} from '@/lib/timerUtils';

export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>(() => loadTimers());
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => loadActivityLog());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update running timers every second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers(prevTimers => {
        const hasRunning = prevTimers.some(t => t.status === 'running');
        if (!hasRunning) return prevTimers;

        const updated = prevTimers.map(timer => {
          if (timer.status === 'running' && timer.startTime) {
            return {
              ...timer,
              elapsedTime: timer.elapsedTime + 1000,
            };
          }
          return timer;
        });

        saveTimers(updated);
        return updated;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Save timers when they change
  useEffect(() => {
    saveTimers(timers);
  }, [timers]);

  const startTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || timer.status === 'running') return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'started');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'running' as const, startTime: Date.now(), pausedAt: null }
          : t
      );
    });
  }, [activityLog]);

  const pauseTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || timer.status !== 'running') return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'paused');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'paused' as const, pausedAt: Date.now() }
          : t
      );
    });
  }, [activityLog]);

  const resumeTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || timer.status !== 'paused') return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'resumed');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'running' as const, startTime: Date.now(), pausedAt: null }
          : t
      );
    });
  }, [activityLog]);

  const stopTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'paused')) return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'stopped');
      setActivityLog(newLog);

      // Update daily stats with the elapsed time
      updateDailyStats(timerId, timer.elapsedTime);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'stopped' as const, startTime: null, pausedAt: null }
          : t
      );
    });
  }, [activityLog]);

  const resetTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer) return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'reset');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'idle' as const, startTime: null, elapsedTime: 0, pausedAt: null }
          : t
      );
    });
  }, [activityLog]);

  const getActiveTimers = useCallback(() => {
    return timers.filter(t => t.status === 'running' || t.status === 'paused');
  }, [timers]);

  return {
    timers,
    activityLog,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    resetTimer,
    getActiveTimers,
  };
}
