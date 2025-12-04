import { useState, useEffect, useCallback, useRef } from 'react';
import { Timer, ActivityLogEntry, WARNING_THRESHOLD } from '@/types/timer';
import {
  loadTimers,
  saveTimers,
  loadActivityLog,
  addActivityLogEntry,
  updateDailyStats,
} from '@/lib/timerUtils';
import { useTimerAlerts } from './useTimerAlerts';

export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>(() => loadTimers());
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() => loadActivityLog());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const warnedTimersRef = useRef<Set<string>>(new Set());
  const { playWarningBeep, playFinishedAlarm, stopAlarm } = useTimerAlerts();

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimers(prevTimers => {
        const hasRunning = prevTimers.some(t => t.status === 'running' || t.status === 'warning');
        if (!hasRunning) return prevTimers;

        const updated = prevTimers.map(timer => {
          if ((timer.status === 'running' || timer.status === 'warning') && timer.startTime) {
            const newRemaining = timer.remainingTime - 1000;
            
            // Timer finished
            if (newRemaining <= 0) {
              playFinishedAlarm(timer.id, timer.name);
              const newLog = addActivityLogEntry(activityLog, timer.id, timer.name, 'finished');
              setActivityLog(newLog);
              updateDailyStats(timer.id, timer.elapsedTime + 1000);
              warnedTimersRef.current.delete(timer.id);
              
              return {
                ...timer,
                remainingTime: 0,
                elapsedTime: timer.elapsedTime + 1000,
                status: 'finished' as const,
              };
            }
            
            // Warning at 5 minutes
            if (newRemaining <= WARNING_THRESHOLD && timer.status === 'running') {
              if (!warnedTimersRef.current.has(timer.id)) {
                warnedTimersRef.current.add(timer.id);
                playWarningBeep(timer.name);
                const newLog = addActivityLogEntry(activityLog, timer.id, timer.name, 'warning');
                setActivityLog(newLog);
              }
              
              return {
                ...timer,
                remainingTime: newRemaining,
                elapsedTime: timer.elapsedTime + 1000,
                status: 'warning' as const,
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
  }, [activityLog, playWarningBeep, playFinishedAlarm]);

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
      if (!timer || timer.status === 'running' || timer.status === 'warning') return prevTimers;

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
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      
      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'stopped');
      setActivityLog(newLog);

      updateDailyStats(timerId, timer.elapsedTime);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'stopped' as const, startTime: null }
          : t
      );
    });
  }, [activityLog, stopAlarm]);

  const extendTimer = useCallback((timerId: string, additionalMinutes: number = 60) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      
      const additionalMs = additionalMinutes * 60 * 1000;
      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'extended');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              status: 'running' as const, 
              remainingTime: t.remainingTime + additionalMs,
              duration: t.duration + additionalMs,
              startTime: Date.now()
            }
          : t
      );
    });
  }, [activityLog, stopAlarm]);

  const resetTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);

      const newLog = addActivityLogEntry(activityLog, timerId, timer.name, 'reset');
      setActivityLog(newLog);

      return prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'idle' as const, startTime: null, remainingTime: t.duration, elapsedTime: 0 }
          : t
      );
    });
  }, [activityLog, stopAlarm]);

  const getActiveTimers = useCallback(() => {
    return timers.filter(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');
  }, [timers]);

  return {
    timers,
    activityLog,
    setDuration,
    startTimer,
    stopTimer,
    extendTimer,
    resetTimer,
    getActiveTimers,
  };
}
