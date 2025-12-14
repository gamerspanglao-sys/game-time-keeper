import { useState, useEffect } from 'react';
import { QueueEntry, QueueState } from '@/types/queue';

const QUEUE_STORAGE_KEY = 'gaming_timer_queue';

const loadQueue = (): QueueState => {
  try {
    const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const saveQueue = (queue: QueueState) => {
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
};

export function useQueue() {
  const [queue, setQueue] = useState<QueueState>(loadQueue);

  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  const addToQueue = (timerId: string, name: string, hours: number = 1) => {
    const entry: QueueEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name.trim(),
      timerId,
      timestamp: Date.now(),
      hours,
    };

    setQueue(prev => ({
      ...prev,
      [timerId]: [...(prev[timerId] || []), entry],
    }));
  };

  const removeFromQueue = (timerId: string, entryId: string) => {
    setQueue(prev => ({
      ...prev,
      [timerId]: (prev[timerId] || []).filter(e => e.id !== entryId),
    }));
  };

  const getQueueForTimer = (timerId: string): QueueEntry[] => {
    return queue[timerId] || [];
  };

  const getNextInQueue = (timerId: string): QueueEntry | null => {
    const timerQueue = queue[timerId] || [];
    return timerQueue[0] || null;
  };

  const clearTimerQueue = (timerId: string) => {
    setQueue(prev => ({
      ...prev,
      [timerId]: [],
    }));
  };

  return {
    queue,
    addToQueue,
    removeFromQueue,
    getQueueForTimer,
    getNextInQueue,
    clearTimerQueue,
  };
}
