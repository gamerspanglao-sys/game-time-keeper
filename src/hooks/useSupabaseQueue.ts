import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { QueueEntry, QueueState } from '@/types/queue';

export function useSupabaseQueue() {
  const [queue, setQueue] = useState<QueueState>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load queue from database
  const loadQueue = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('queue')
        .select('*')
        .order('added_at', { ascending: true });
      
      if (error) {
        console.error('Error loading queue:', error);
        return;
      }

      if (data) {
        const queueState: QueueState = {};
        data.forEach(entry => {
          const queueEntry: QueueEntry = {
            id: entry.id,
            name: entry.customer_name,
            timerId: entry.timer_id,
            timestamp: Number(entry.added_at),
            hours: (entry as any).hours || 1,
          };
          if (!queueState[entry.timer_id]) {
            queueState[entry.timer_id] = [];
          }
          queueState[entry.timer_id].push(queueEntry);
        });
        setQueue(queueState);
      }
    } catch (err) {
      console.error('Error in loadQueue:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('queue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue' },
        (payload) => {
          console.log('Queue update received:', payload);
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadQueue]);

  const addToQueue = useCallback(async (timerId: string, name: string, hours: number = 1) => {
    const entry = {
      timer_id: timerId,
      customer_name: name.trim(),
      added_at: Date.now(),
      hours: hours,
    };

    try {
      const { data, error } = await supabase
        .from('queue')
        .insert(entry)
        .select()
        .single();
      
      if (error) {
        console.error('Error adding to queue:', error);
        return;
      }

      if (data) {
        const queueEntry: QueueEntry = {
          id: data.id,
          name: data.customer_name,
          timerId: data.timer_id,
          timestamp: Number(data.added_at),
          hours: (data as any).hours || 1,
        };

        setQueue(prev => ({
          ...prev,
          [timerId]: [...(prev[timerId] || []), queueEntry],
        }));
      }
    } catch (err) {
      console.error('Error in addToQueue:', err);
    }
  }, []);

  const removeFromQueue = useCallback(async (timerId: string, entryId: string) => {
    try {
      const { error } = await supabase
        .from('queue')
        .delete()
        .eq('id', entryId);
      
      if (error) {
        console.error('Error removing from queue:', error);
        return;
      }

      setQueue(prev => ({
        ...prev,
        [timerId]: (prev[timerId] || []).filter(e => e.id !== entryId),
      }));
    } catch (err) {
      console.error('Error in removeFromQueue:', err);
    }
  }, []);

  const getQueueForTimer = useCallback((timerId: string): QueueEntry[] => {
    return queue[timerId] || [];
  }, [queue]);

  const getNextInQueue = useCallback((timerId: string): QueueEntry | null => {
    const timerQueue = queue[timerId] || [];
    return timerQueue[0] || null;
  }, [queue]);

  const clearTimerQueue = useCallback(async (timerId: string) => {
    try {
      const { error } = await supabase
        .from('queue')
        .delete()
        .eq('timer_id', timerId);
      
      if (error) {
        console.error('Error clearing queue:', error);
        return;
      }

      setQueue(prev => ({
        ...prev,
        [timerId]: [],
      }));
    } catch (err) {
      console.error('Error in clearTimerQueue:', err);
    }
  }, []);

  return {
    queue,
    isLoading,
    addToQueue,
    removeFromQueue,
    getQueueForTimer,
    getNextInQueue,
    clearTimerQueue,
  };
}
