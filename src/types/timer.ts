export type TimerStatus = 'idle' | 'running' | 'paused' | 'stopped';

export type TimerCategory = 'table' | 'playstation' | 'vip';

export interface Timer {
  id: string;
  name: string;
  category: TimerCategory;
  status: TimerStatus;
  startTime: number | null;
  elapsedTime: number;
  pausedAt: number | null;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  timerId: string;
  timerName: string;
  action: 'started' | 'paused' | 'resumed' | 'stopped' | 'reset';
}

export interface DailyStats {
  date: string;
  timers: {
    [timerId: string]: number; // total elapsed time in ms
  };
}
