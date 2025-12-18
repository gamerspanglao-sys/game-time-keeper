import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Timer, ActivityLogEntry, TimerStatus, WARNING_THRESHOLD } from '@/types/timer';
import { useTimerAlerts } from './useTimerAlerts';
import { TIMER_PRICING, getDailyPeriodKey } from '@/lib/timerUtils';
import { ActivityLogger } from '@/lib/activityLogger';

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
  const [overtimeByTimer, setOvertimeByTimer] = useState<Record<string, number>>({});
  const [totalOvertimeMinutes, setTotalOvertimeMinutes] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedTimers, setPausedTimers] = useState<Map<string, { remainingTime: number; status: string }>>(new Map());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const warnedTimersRef = useRef<Set<string>>(new Set());
  const finishedTimersRef = useRef<Set<string>>(new Set());
  const { playWarningBeep, playFinishedAlarm, stopAlarm, stopAllAlarms } = useTimerAlerts();

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

  // Load overtime data
  const loadOvertimeData = useCallback(async () => {
    const periodKey = getDailyPeriodKey();
    
    try {
      const { data } = await supabase
        .from('daily_stats')
        .select('timer_stats')
        .eq('period_key', periodKey)
        .maybeSingle();

      if (data?.timer_stats) {
        const stats = data.timer_stats as Record<string, any>;
        const overtimeEntries = stats.overtime || [];
        
        // Aggregate overtime by timer
        const byTimer: Record<string, number> = {};
        let total = 0;
        
        overtimeEntries.forEach((entry: { timerId: string; overtimeMinutes: number }) => {
          byTimer[entry.timerId] = (byTimer[entry.timerId] || 0) + entry.overtimeMinutes;
          total += entry.overtimeMinutes;
        });
        
        setOvertimeByTimer(byTimer);
        setTotalOvertimeMinutes(total);
      } else {
        setOvertimeByTimer({});
        setTotalOvertimeMinutes(0);
      }
    } catch (err) {
      console.error('Error loading overtime data:', err);
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
  const updateDailyStats = useCallback(async (timerId: string, elapsedTime: number, overtimeMinutes?: number, timerName?: string) => {
    const periodKey = getDailyPeriodKey();
    
    try {
      // Get existing stats
      const { data: existing } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('period_key', periodKey)
        .maybeSingle();

      if (existing) {
        const timerStats = existing.timer_stats as Record<string, any> || {};
        timerStats[timerId] = (timerStats[timerId] || 0) + elapsedTime;
        
        // Add overtime if present
        if (overtimeMinutes && overtimeMinutes > 0 && timerName) {
          if (!timerStats.overtime) {
            timerStats.overtime = [];
          }
          timerStats.overtime.push({
            timerId,
            timerName,
            overtimeMinutes,
            timestamp: Date.now()
          });
        }
        
        await supabase
          .from('daily_stats')
          .update({ 
            timer_stats: timerStats,
            updated_at: new Date().toISOString()
          })
          .eq('period_key', periodKey);
      } else {
        const initialStats: Record<string, any> = { [timerId]: elapsedTime };
        
        if (overtimeMinutes && overtimeMinutes > 0 && timerName) {
          initialStats.overtime = [{
            timerId,
            timerName,
            overtimeMinutes,
            timestamp: Date.now()
          }];
        }
        
        await supabase
          .from('daily_stats')
          .insert({
            period_key: periodKey,
            timer_stats: initialStats,
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
    loadOvertimeData();
  }, [loadTimers, loadActivityLog, loadOvertimeData]);

  // Auto-play alarm for finished timers on load (will work after first user interaction)
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

  const startTimer = useCallback(async (timerId: string, paymentType: 'prepaid' | 'postpaid' = 'postpaid') => {
    // Get current timer state
    const timer = timers.find(t => t.id === timerId);
    if (!timer || timer.status === 'running' || timer.status === 'warning') return;

    const durationMin = Math.round(timer.duration / 60000);
    ActivityLogger.timerStart(timer.name, durationMin, paymentType);
    addActivityLogEntry(timerId, timer.name, 'started');

    // Calculate price for this duration
    const pricePerHour = TIMER_PRICING[timer.id] || 100;
    const hours = Math.ceil(timer.duration / (60 * 60 * 1000));
    const price = hours * pricePerHour;

    const updatedTimer: Timer = {
      ...timer,
      status: 'running' as const,
      startTime: Date.now(),
      remainingAtStart: timer.remainingTime,
      elapsedAtStart: timer.elapsedTime,
      paidAmount: paymentType === 'prepaid' ? price : 0,
      unpaidAmount: paymentType === 'postpaid' ? price : 0,
    };

    // Update local state
    setTimers(prevTimers =>
      prevTimers.map(t => t.id === timerId ? updatedTimer : t)
    );

    // Save to database
    saveTimer(updatedTimer);

    // Create receipt in Loyverse for all timers
    const loyverseTimers = ['ps-1', 'ps-2', 'table-1', 'table-2', 'table-3', 'vip-super', 'vip-medium', 'vip-comfort'];
    if (loyverseTimers.includes(timerId)) {
      console.log(`🎮 Creating Loyverse receipt for ${timer.name}...`);
      try {
        const { data, error } = await supabase.functions.invoke('loyverse-create-receipt', {
          body: { timerId, paymentType, amount: price }
        });
        if (error) {
          console.error('❌ Loyverse receipt error:', error);
        } else {
          console.log('✅ Loyverse receipt created:', data);
        }
      } catch (err) {
        console.error('❌ Failed to create Loyverse receipt:', err);
      }
    }
  }, [timers, addActivityLogEntry, saveTimer]);

  const stopTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      finishedTimersRef.current.delete(timerId);
      
      const elapsedMin = Math.round(timer.elapsedTime / 60000);
      ActivityLogger.timerStop(timer.name, elapsedMin);
      addActivityLogEntry(timerId, timer.name, 'stopped');
      
      // Calculate overtime if timer went negative
      const overtimeMinutes = timer.remainingTime < 0 ? Math.ceil(Math.abs(timer.remainingTime) / 60000) : 0;
      updateDailyStats(timerId, timer.elapsedTime, overtimeMinutes, timer.name);

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

  const extendTimer = useCallback(async (timerId: string, additionalMinutes: number = 60, paymentType: 'prepaid' | 'postpaid' = 'postpaid') => {
    const timer = timers.find(t => t.id === timerId);
    if (!timer || (timer.status !== 'running' && timer.status !== 'warning' && timer.status !== 'finished')) return;

    stopAlarm(timerId);
    warnedTimersRef.current.delete(timerId);
    finishedTimersRef.current.delete(timerId);
    
    const additionalMs = additionalMinutes * 60 * 1000;
    ActivityLogger.timerExtend(timer.name, additionalMinutes, paymentType);
    addActivityLogEntry(timerId, timer.name, 'extended');

    // Calculate additional price
    const pricePerHour = TIMER_PRICING[timer.id] || 100;
    const additionalPrice = Math.ceil(additionalMinutes / 60) * pricePerHour;

    const newRemaining = timer.remainingTime + additionalMs;
    const updatedTimer: Timer = {
      ...timer,
      status: 'running' as const,
      remainingTime: newRemaining,
      duration: timer.duration + additionalMs,
      startTime: Date.now(),
      remainingAtStart: newRemaining,
      elapsedAtStart: timer.elapsedTime,
      paidAmount: paymentType === 'prepaid' ? timer.paidAmount + additionalPrice : timer.paidAmount,
      unpaidAmount: paymentType === 'postpaid' ? timer.unpaidAmount + additionalPrice : timer.unpaidAmount,
    };

    setTimers(prevTimers =>
      prevTimers.map(t => t.id === timerId ? updatedTimer : t)
    );

    saveTimer(updatedTimer);

    // Create receipt in Loyverse for all timer extensions
    const loyverseTimers = ['ps-1', 'ps-2', 'table-1', 'table-2', 'table-3', 'vip-super', 'vip-medium', 'vip-comfort'];
    if (loyverseTimers.includes(timerId)) {
      console.log(`🎮 Creating Loyverse receipt for ${timer.name} extension...`);
      try {
        const { data, error } = await supabase.functions.invoke('loyverse-create-receipt', {
          body: { timerId, paymentType, amount: additionalPrice }
        });
        if (error) {
          console.error('❌ Loyverse receipt error:', error);
        } else {
          console.log('✅ Loyverse receipt created:', data);
        }
      } catch (err) {
        console.error('❌ Failed to create Loyverse receipt:', err);
      }
    }
  }, [timers, stopAlarm, addActivityLogEntry, saveTimer]);

  const resetTimer = useCallback((timerId: string) => {
    setTimers(prevTimers => {
      const timer = prevTimers.find(t => t.id === timerId);
      if (!timer) return prevTimers;

      stopAlarm(timerId);
      warnedTimersRef.current.delete(timerId);
      finishedTimersRef.current.delete(timerId);

      ActivityLogger.timerReset(timer.name);
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

      ActivityLogger.timerAdjust(timer.name, adjustMinutes);
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

  // Pause all active timers (for power outages)
  const pauseAllTimers = useCallback(async () => {
    const activeTimers = timers.filter(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');
    if (activeTimers.length === 0) return;

    // Stop all alarms
    stopAllAlarms();

    // Save paused state for each timer
    const pausedState = new Map<string, { remainingTime: number; status: string }>();
    
    setTimers(prevTimers => {
      const updated = prevTimers.map(timer => {
        if (timer.status === 'running' || timer.status === 'warning' || timer.status === 'finished') {
          pausedState.set(timer.id, { 
            remainingTime: timer.remainingTime, 
            status: timer.status 
          });
          
          const pausedTimer = {
            ...timer,
            status: 'stopped' as const,
            startTime: null,
          };
          saveTimer(pausedTimer);
          addActivityLogEntry(timer.id, timer.name, 'stopped');
          return pausedTimer;
        }
        return timer;
      });
      return updated;
    });

    setPausedTimers(pausedState);
    setIsPaused(true);
  }, [timers, stopAllAlarms, saveTimer, addActivityLogEntry]);

  // Resume all paused timers
  const resumeAllTimers = useCallback(async () => {
    if (!isPaused || pausedTimers.size === 0) return;

    const now = Date.now();
    
    setTimers(prevTimers => {
      const updated = prevTimers.map(timer => {
        const pausedData = pausedTimers.get(timer.id);
        if (pausedData && timer.status === 'stopped') {
          const resumedTimer = {
            ...timer,
            status: pausedData.status as Timer['status'],
            startTime: now,
            remainingAtStart: pausedData.remainingTime,
            remainingTime: pausedData.remainingTime,
          };
          saveTimer(resumedTimer);
          addActivityLogEntry(timer.id, timer.name, 'started');
          
          // Re-trigger warnings/alarms if needed
          if (pausedData.status === 'warning') {
            warnedTimersRef.current.add(timer.id);
          }
          if (pausedData.status === 'finished') {
            finishedTimersRef.current.add(timer.id);
            playFinishedAlarm(timer.id, timer.name);
          }
          
          return resumedTimer;
        }
        return timer;
      });
      return updated;
    });

    setPausedTimers(new Map());
    setIsPaused(false);
  }, [isPaused, pausedTimers, saveTimer, addActivityLogEntry, playFinishedAlarm]);

  // Start promo timer (VIP Super + Basket Red Horse)
  const startPromoTimer = useCallback(async (timerId: string): Promise<{ success: boolean; error?: string }> => {
    const timer = timers.find(t => t.id === timerId);
    if (!timer || timer.status !== 'idle') return { success: false, error: 'Timer not available' };

    const promoPrice = 1000; // 1000 pesos for promo
    const promoDuration = 2 * 60 * 60 * 1000; // 2 hours

    // First try to create Loyverse receipt
    console.log(`🎉 Creating Loyverse promo receipt for ${timer.name}...`);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-create-receipt', {
        body: { timerId, paymentType: 'prepaid', amount: promoPrice, promoId: 'basket-redhorse' }
      });
      
      if (error) {
        console.error('❌ Loyverse promo receipt error:', error);
        return { success: false, error: 'Failed to create receipt in POS' };
      }
      
      if (data?.skipped) {
        console.error('❌ Loyverse promo item not found:', data.message);
        return { success: false, error: data.message || 'Promo item not found in POS' };
      }
      
      console.log('✅ Loyverse promo receipt created:', data);
    } catch (err) {
      console.error('❌ Failed to create Loyverse promo receipt:', err);
      return { success: false, error: 'Connection error with POS' };
    }

    // Only start timer if receipt was created successfully
    ActivityLogger.timerPromo(timer.name, promoPrice);
    addActivityLogEntry(timerId, timer.name, 'started');

    const updatedTimer: Timer = {
      ...timer,
      status: 'running' as const,
      startTime: Date.now(),
      duration: promoDuration,
      remainingTime: promoDuration,
      remainingAtStart: promoDuration,
      elapsedAtStart: 0,
      elapsedTime: 0,
      paidAmount: promoPrice,
      unpaidAmount: 0,
    };

    // Update local state
    setTimers(prevTimers =>
      prevTimers.map(t => t.id === timerId ? updatedTimer : t)
    );

    // Save to database
    saveTimer(updatedTimer);
    
    return { success: true };
  }, [timers, addActivityLogEntry, saveTimer]);

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
    overtimeByTimer,
    totalOvertimeMinutes,
    refreshOvertime: loadOvertimeData,
    isPaused,
    pauseAllTimers,
    resumeAllTimers,
    startPromoTimer,
  };
}
