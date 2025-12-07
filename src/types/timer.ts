export type TimerStatus = 'idle' | 'running' | 'warning' | 'finished' | 'stopped';

export type TimerCategory = 'billiard' | 'playstation' | 'vip';

export interface Timer {
  id: string;
  name: string;
  category: TimerCategory;
  status: TimerStatus;
  startTime: number | null;
  duration: number; // countdown duration in ms
  remainingTime: number; // remaining time in ms
  elapsedTime: number; // for stats tracking
  remainingAtStart?: number; // remaining time when timer was started
  elapsedAtStart?: number; // elapsed time when timer was started
  paidAmount: number; // prepaid amount in pesos
  unpaidAmount: number; // postpaid amount in pesos
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  timerId: string;
  timerName: string;
  action: 'started' | 'stopped' | 'reset' | 'finished' | 'extended' | 'warning';
}

export interface DailyStats {
  date: string;
  timers: {
    [timerId: string]: number;
  };
}

// Preset durations in minutes (1h, 2h, 3h)
export const DURATION_PRESETS = [60, 120, 180];

// Warning threshold - 5 minutes in ms
export const WARNING_THRESHOLD = 5 * 60 * 1000;
