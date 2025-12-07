import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Timer, ActivityLogEntry, TimerStatus, WARNING_THRESHOLD } from '@/types/timer';
import { useTimerAlerts } from './useTimerAlerts';
import { TIMER_PRICING, getDailyPeriodKey } from '@/lib/timerUtils';

const DEFAULT_TIMERS: Timer[] = [
  { id: 'table-1', name: 'Table 1', category: 'billiard', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'table-2', name: 'Table 2', category: 'billiard', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'table-3', name: 'Table 3', category: 'billiard', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'ps-1', name: 'PlayStation 1', category: 'playstation', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'ps-2', name: 'PlayStation 2', category: 'playstation', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'vip-super', name: 'VIP Super', category: 'vip', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'vip-medium', name: 'VIP Medium', category: 'vip', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
  { id: 'vip-comfort', name: 'VIP Comfort', category: 'vip', status: 'idle', startTime: null, duration: 3600000, remainingTime: 3600000, elapsedTime: 0, paidAmount: 0, unpaidAmount: 0 },
];

export function useSupabaseTimers() {
  const [timers, setTimers] = useState<Timer[]>(DEFAULT_TIMERS);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const warnedTimersRef = useRef<Set<string>>(new Set());
  const finishedTimersRef = useRef<Set<string>>(new Set());
  const { playWarningBeep, playFinishedAlarm, stopAlarm } = useTimerAlerts();

  // Load timers from database
  const loadTimers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('timers')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) {
        console.error('Error loading timers:', error);
        return;
      }

      if (data && data.length > 0) {
        const loadedTimers: Timer[] = data.map(t => ({
          id: t.id,
          name: t.name,
          category: t.category as Timer['category'],
          status: t.status as TimerStatus,
          startTime: t.start_time ? Number(t.start_time) : null,
          duration: t.duration,
          remainingTime: t.remaining_time,
          elapsedTime: t.elapsed_time,
          remainingAtStart: t.remaining_at_start ?? undefined,
          paidAmount: t.paid_amount || 0,
          unpaidAmount: t.unpaid_amount || 0,
        }));

        // Recalculate running/warning/finished timers
        const now = Date.now();
        const adjustedTimers = loadedTimers.map(timer => {
          if ((timer.status === 'running' || timer.status === 'warning' || timer.status === 'finished') && timer.startTime && timer.remainingAtStart !== undefined) {
            const elapsedSinceStart = now - timer.startTime;
            const newRemaining = timer.remainingAtStart - elapsedSinceStart; // Allow negative
            return {
              ...timer,
              remainingTime: newRemaining,
              status: newRemaining <= 0 ? 'finished' as TimerStatus : 
                      newRemaining <= WARNING_THRESHOLD ? 'warning' as TimerStatus : 
                      timer.status === 'finished' ? 'running' as TimerStatus : timer.status
            };
          }
          return timer;
        });

        setTimers(adjustedTimers);
      }
    } catch (err) {
      console.error('Error in loadTimers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load activity log from database
  const loadActivityLog = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      
      if (error) {
        console.error('Error loading activity log:', error);
        return;
      }

      if (data) {
        const log: ActivityLogEntry[] = data.map(entry => ({
          id: entry.id,
          timestamp: Number(entry.timestamp),
          timerId: entry.timer_id,
          timerName: entry.timer_name,
          action: entry.action as ActivityLogEntry['action'],
        }));
        setActivityLog(log);
      }
    } catch (err) {
      console.error('Error in loadActivityLog:', err);
    }
  }, []);

  // Save timer to database
  const saveTimer = useCallback(async (timer: Timer) => {
    try {
      const { error } = await supabase
        .from('timers')
        .upsert({
          id: timer.id,
          name: timer.name,
          category: timer.category,
          status: timer.status,
          duration: timer.duration,
          remaining_time: timer.remainingTime,
          remaining_at_start: timer.remainingAtStart,
          start_time: timer.startTime,
          elapsed_time: timer.elapsedTime,
          paid_amount: timer.paidAmount,
          unpaid_amount: timer.unpaidAmount,
          updated_at: new Date().toISOString(),
        });
      
      if (error) {
        console.error('Error saving timer:', error);
      }
    } catch (err) {
      console.error('Error in saveTimer:', err);
    }
  }, []);

  // Add activity log entry
  const addActivityLogEntry = useCallback(async (timerId: string, timerName: string, action: ActivityLogEntry['action']) => {
    const entry: ActivityLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      timerId,
      timerName,
      action,
    };

    try {
      const { error } = await supabase
        .from('activity_log')
        .insert({
          timestamp: entry.timestamp,
          timer_id: entry.timerId,
          timer_name: entry.timerName,
          action: entry.action,
        });
      
      if (error) {
        console.error('Error adding activity log:', error);
      }
    } catch (err) {
      console.error('Error in addActivityLogEntry:', err);
    }

    setActivityLog(prev => [entry, ...prev].slice(0, 500));
    return entry;
  }, []);

  // Update daily stats
  const updateDailyStats = useCallback(async (timerId: string, elapsedTime: number) => {
    const periodKey = getDailyPeriodKey();
    
    try {
      // Get existing stats
      const { data: existing } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('period_key', periodKey)
        .maybeSingle();

      if (existing) {
        const timerStats = existing.timer_stats as Record<string, number> || {};
        timerStats[timerId] = (timerStats[timerId] || 0) + elapsedTime;
        
        await supabase
          .from('daily_stats')
          .update({ 
            timer_stats: timerStats,
            updated_at: new Date().toISOString()
          })
          .eq('period_key', periodKey);
      } else {
        await supabase
          .from('daily_stats')
          .insert({
            period_key: periodKey,
            timer_stats: { [timerId]: elapsedTime },
          });
      }
    } catch (err) {
      console.error('Error updating daily stats:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadTimers();
    loadActivityLog();
  }, [loadTimers, loadActivityLog]);

  // Play alarm for finished timers on load
  useEffect(() => {
    if (!isLoading) {
      timers.forEach(timer => {
        if (timer.status === 'finished' && !finishedTimersRef.current.has(timer.id)) {
          finishedTimersRef.current.add(timer.id);
          playFinishedAlarm(timer.id, timer.name);
        }
      });
    }
  }, [isLoading, timers, playFinishedAlarm]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('timers-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'timers' },
        (payload) => {
          console.log('Timer update received:', payload);
          loadTimers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTimers]);

  // Timer tick interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      
      setTimers(prevTimers => {
        const hasActive = prevTimers.some(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');
        if (!hasActive) return prevTimers;

        const updated = prevTimers.map(timer => {
          if ((timer.status === 'running' || timer.status === 'warning' || timer.status === 'finished') && timer.startTime && timer.remainingAtStart !== undefined) {
            const elapsedSinceStart = now - timer.startTime;
            const newRemaining = timer.remainingAtStart - elapsedSinceStart; // Allow negative
            const newElapsed = (timer.elapsedAtStart || 0) + elapsedSinceStart;
            
            // Timer just crossed zero - trigger finished once
            if (newRemaining <= 0 && timer.status !== 'finished') {
              if (!finishedTimersRef.current.has(timer.id)) {
                finishedTimersRef.current.add(timer.id);
                playFinishedAlarm(timer.id, timer.name);
                addActivityLogEntry(timer.id, timer.name, 'finished');
              }
              warnedTimersRef.current.delete(timer.id);
              
              const finishedTimer = {
                ...timer,
                remainingTime: newRemaining,
                elapsedTime: newElapsed,
                status: 'finished' as const,
              };
              saveTimer(finishedTimer);
              return finishedTimer;
            }
            
            // Already finished - keep counting into negative
            if (timer.status === 'finished') {
              return {
                ...timer,
                remainingTime: newRemaining,
                elapsedTime: newElapsed,
              };
            }
            
            // Warning at 5 minutes
            if (newRemaining <= WARNING_THRESHOLD && timer.status === 'running') {
              if (!warnedTimersRef.current.has(timer.id)) {
                warnedTimersRef.current.add(timer.id);
                playWarningBeep(timer.name);
                addActivityLogEntry(timer.id, timer.name, 'warning');
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

        return updated;
      });
    }, 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [playWarningBeep, playFinishedAlarm, addActivityLogEntry, updateDailyStats, saveTimer]);

  // Timer actions
  const setDuration = useCallback((timerId: string, durationMinutes: number) => {
    const durationMs = durationMinutes * 60 * 1000;
    setTimers(prevTimers =>
      prevTimers.map(t => {
        if (t.id === timerId && t.status === 'idle') {
          const updated = { ...t, duration: durationMs, remainingTime: durationMs };
          saveTimer(updated);
          return updated;
        }
        return t;
      })
    );
  }, [saveTimer]);

  const startTimer = useCallback((timerId: string, paymentType: 'prepaid' | 'postpaid' = 'postpaid') => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || timer.status === 'running' || timer.status === 'warning') return prevTimers;

      addActivityLogEntry(timerId, timer.name, 'started');

      // Calculate price for this duration
      const pricePerHour = TIMER_PRICING[timer.id] || 100;
      const hours = Math.ceil(timer.duration / (60 * 60 * 1000));
      const price = hours * pricePerHour;

      const updated = prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              status: 'running' as const, 
              startTime: Date.now(),
              remainingAtStart: t.remainingTime,
              elapsedAtStart: t.elapsedTime,
              paidAmount: paymentType === 'prepaid' ? price : 0,
              unpaidAmount: paymentType === 'postpaid' ? price : 0,
            }
          : t
      );

      const updatedTimer = updated.find(t => t.id === timerId);
      if (updatedTimer) saveTimer(updatedTimer);

      return updated;
    });
  }, [addActivityLogEntry, saveTimer]);

  const stopTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      
      addActivityLogEntry(timerId, timer.name, 'stopped');
      updateDailyStats(timerId, timer.elapsedTime);

      const updated = prevTimers.map(t =>
        t.id === timerId
          ? { ...t, status: 'stopped' as const, startTime: null }
          : t
      );

      const updatedTimer = updated.find(t => t.id === timerId);
      if (updatedTimer) saveTimer(updatedTimer);

      return updated;
    });
  }, [stopAlarm, addActivityLogEntry, updateDailyStats, saveTimer]);

  const extendTimer = useCallback((timerId: string, additionalMinutes: number = 60, paymentType: 'prepaid' | 'postpaid' = 'postpaid') => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      
      const additionalMs = additionalMinutes * 60 * 1000;
      addActivityLogEntry(timerId, timer.name, 'extended');

      // Calculate additional price
      const pricePerHour = TIMER_PRICING[timer.id] || 100;
      const additionalPrice = Math.ceil(additionalMinutes / 60) * pricePerHour;

      const newRemaining = timer.remainingTime + additionalMs;
      const updated = prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              status: 'running' as const, 
              remainingTime: newRemaining,
              duration: t.duration + additionalMs,
              startTime: Date.now(),
              remainingAtStart: newRemaining,
              elapsedAtStart: t.elapsedTime,
              paidAmount: paymentType === 'prepaid' ? t.paidAmount + additionalPrice : t.paidAmount,
              unpaidAmount: paymentType === 'postpaid' ? t.unpaidAmount + additionalPrice : t.unpaidAmount,
            }
          : t
      );

      const updatedTimer = updated.find(t => t.id === timerId);
      if (updatedTimer) saveTimer(updatedTimer);

      return updated;
    });
  }, [stopAlarm, addActivityLogEntry, saveTimer]);

  const resetTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      finishedTimersRef.current.delete(timerId);

      addActivityLogEntry(timerId, timer.name, 'reset');

      const updated = prevTimers.map(t =>
        t.id === timerId
          ? { 
              ...t, 
              status: 'idle' as const, 
              startTime: null, 
              remainingTime: 3600000, // Reset to 1 hour
              duration: 3600000,
              elapsedTime: 0,
              paidAmount: 0,
              unpaidAmount: 0,
            }
          : t
      );

      const updatedTimer = updated.find(t => t.id === timerId);
      if (updatedTimer) saveTimer(updatedTimer);

      return updated;
    });
  }, [stopAlarm, addActivityLogEntry, saveTimer]);

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
      
      if (newRemaining <= 0) {
        const updated = prevTimers.map(t =>
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
        const updatedTimer = updated.find(t => t.id === timerId);
        if (updatedTimer) saveTimer(updatedTimer);
        return updated;
      }

      if (newRemaining > WARNING_THRESHOLD && timer.status === 'warning') {
        warnedTimersRef.current.delete(timerId);
      }

      const updated = prevTimers.map(t =>
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

      const updatedTimer = updated.find(t => t.id === timerId);
      if (updatedTimer) saveTimer(updatedTimer);

      return updated;
    });
  }, [saveTimer]);

  const getActiveTimers = useCallback(() => {
    return timers.filter(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');
  }, [timers]);

  return {
    timers,
    activityLog,
    isLoading,
    setDuration,
    startTimer,
    stopTimer,
    extendTimer,
    resetTimer,
    adjustTime,
    getActiveTimers,
  };
}
