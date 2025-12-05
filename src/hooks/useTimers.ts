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
      const now = Date.now();
      
      setTimers(prevTimers => {
        const hasRunning = prevTimers.some(t => t.status === 'running' || t.status === 'warning');
        if (!hasRunning) return prevTimers;

        const updated = prevTimers.map(timer => {
          if ((timer.status === 'running' || timer.status === 'warning') && timer.startTime && timer.remainingAtStart !== undefined) {
            // Calculate actual elapsed time since timer started
            const elapsedSinceStart = now - timer.startTime;
            const newRemaining = Math.max(0, timer.remainingAtStart - elapsedSinceStart);
            const newElapsed = (timer.elapsedAtStart || 0) + elapsedSinceStart;
            
            // Timer finished
            if (newRemaining <= 0) {
              playFinishedAlarm(timer.id, timer.name);
              const newLog = addActivityLogEntry(activityLog, timer.id, timer.name, 'finished');
              setActivityLog(newLog);
              updateDailyStats(timer.id, newElapsed);
              warnedTimersRef.current.delete(timer.id);
              
              return {
                ...timer,
                remainingTime: 0,
                elapsedTime: newElapsed,
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
                elapsedTime: newElapsed,
                status: 'warning' as const,
              };
            }
            
            return {
              ...timer,
              remainingTime: newRemaining,
              elapsedTime: newElapsed,
            };
          }
          return timer;
        });

        saveTimers(updated);
        return updated;
      });
    }, 250); // More frequent updates for smoother display

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
          ? { 
              ...t, 
              status: 'running' as const, 
              startTime: Date.now(),
              remainingAtStart: t.remainingTime,
              elapsedAtStart: t.elapsedTime
            }
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

      const newRemaining = timer.remainingTime + additionalMs;
      return prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              status: 'running' as const, 
              remainingTime: newRemaining,
              duration: t.duration + additionalMs,
              startTime: Date.now(),
              remainingAtStart: newRemaining,
              elapsedAtStart: t.elapsedTime
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

  const adjustTime = useCallback((timerId: string, adjustMinutes: number) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) {
        return prevTimers;
      }

      const adjustMs = adjustMinutes * 60 * 1000;
      const newRemaining = Math.max(0, timer.remainingTime + adjustMs);
      const newDuration = Math.max(0, timer.duration + adjustMs);
      const newRemainingAtStart = (timer.remainingAtStart ?? timer.remainingTime) + adjustMs;
      
      // If we're reducing time and it hits 0, mark as finished
      if (newRemaining <= 0) {
        return prevTimers.map(t =>
          t.id === timerId
            ? { 
                ...t, 
                remainingTime: 0,
                duration: newDuration,
                remainingAtStart: Math.max(0, newRemainingAtStart),
                status: 'finished' as const
              }
            : t
        );
      }

      // Reset warning state if time was extended above threshold
      if (newRemaining > WARNING_THRESHOLD && timer.status === 'warning') {
        warnedTimersRef.current.delete(timerId);
      }

      return prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              remainingTime: newRemaining,
              duration: newDuration,
              remainingAtStart: newRemainingAtStart,
              status: newRemaining <= WARNING_THRESHOLD ? 'warning' as const : 'running' as const
            }
          : t
      );
    });
  }, []);

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
    adjustTime,
    getActiveTimers,
  };
}
