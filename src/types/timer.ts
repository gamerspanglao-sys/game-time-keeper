export type TimerStatus = 'idle' | 'running' | 'stopped' | 'finished';

export type TimerCategory = 'table' | 'playstation' | 'vip';

export interface Timer {
  id: string;
  name: string;
  category: TimerCategory;
  status: TimerStatus;
  startTime: number | null;
  duration: number; // countdown duration in ms
  remainingTime: number; // remaining time in ms
  elapsedTime: number; // for stats tracking
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  timerId: string;
  timerName: string;
  action: 'started' | 'stopped' | 'reset' | 'finished';
}

export interface DailyStats {
  date: string;
  timers: {
    [timerId: string]: number;
  };
}

// Preset durations in minutes
export const DURATION_PRESETS = [30, 60, 90, 120, 180];
