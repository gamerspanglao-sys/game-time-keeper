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

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers(prevTimers => {
        const hasRunning = prevTimers.some(t => t.status === 'running');
        if (!hasRunning) return prevTimers;

        const updated = prevTimers.map(timer => {
          if (timer.status === 'running' && timer.startTime) {
            const newRemaining = timer.remainingTime - 1000;
            
            if (newRemaining <= 0) {
              // Timer finished
              const newLog = addActivityLogEntry(activityLog, timer.id, timer.name, 'finished');
              setActivityLog(newLog);
              updateDailyStats(timer.id, timer.elapsedTime + 1000);
              
              return {
                ...timer,
                remainingTime: 0,
                elapsedTime: timer.elapsedTime + 1000,
                status: 'finished' as const,
              };
            }
            
            return {
              ...timer,
              remainingTime: newRemaining,
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
  }, [activityLog]);

  useEffect(() => {
    saveTimers(timers);
  }, [timers]);

  const setDuration = useCallback((timerId: string, durationMinutes: number) => {
    const durationMs = durationMinutes * 60 * 1000;
    setTimers(prevTimers =>
      prevTimers.map(t =>
        t.id === timerId && t.status === 'idle'
          ? { ...t, duration: durationMs, remainingTime: durationMs }
          : t
      )
    );
  }, []);

  const startTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || timer.status === 'running') return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'started');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'running' as const, startTime: Date.now() }
          : t
      );
    });
  }, [activityLog]);

  const stopTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'finished')) return prevTimers;

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'stopped');
      setActivityLog(newLog);

      updateDailyStats(timerId, timer.elapsedTime);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'stopped' as const, startTime: null }
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
          ? { ...t, status: 'idle' as const, startTime: null, remainingTime: t.duration, elapsedTime: 0 }
          : t
      );
    });
  }, [activityLog]);

  const getActiveTimers = useCallback(() => {
    return timers.filter(t => t.status === 'running' || t.status === 'finished');
  }, [timers]);

  return {
    timers,
    activityLog,
    setDuration,
    startTimer,
    stopTimer,
    resetTimer,
    getActiveTimers,
  };
}
