import { Timer, ActivityLogEntry, DailyStats, TimerStatus } from '@/types/timer';

const STORAGE_KEYS = {
  TIMERS: 'gamers_timers',
  ACTIVITY_LOG: 'gamers_activity_log',
  DAILY_STATS: 'gamers_daily_stats',
};

export const DEFAULT_TIMERS: Timer[] = [
  { id: 'table-1', name: 'Table 1', category: 'table', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'table-2', name: 'Table 2', category: 'table', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'table-3', name: 'Table 3', category: 'table', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'playstation', name: 'PlayStation', category: 'playstation', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'vip-super', name: 'VIP Super', category: 'vip', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'vip-medium', name: 'VIP Medium', category: 'vip', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
  { id: 'vip-comfort', name: 'VIP Comfort', category: 'vip', status: 'idle', startTime: null, elapsedTime: 0, pausedAt: null },
];

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `[${year}-${month}-${day} ${hours}:${minutes}]`;
}

export function getDailyPeriodKey(): string {
  const now = new Date();
  const hours = now.getHours();
  
  // If before 5am, use previous day
  if (hours < 5) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }
  
  return now.toISOString().split('T')[0];
}

export function isWithinCurrentPeriod(timestamp: number): boolean {
  const now = new Date();
  const date = new Date(timestamp);
  
  // Get the start of current period (5am today or 5am yesterday)
  const periodStart = new Date(now);
  if (now.getHours() < 5) {
    periodStart.setDate(periodStart.getDate() - 1);
  }
  periodStart.setHours(5, 0, 0, 0);
  
  // Get the end of current period (5am tomorrow or 5am today)
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 1);
  
  return date >= periodStart && date < periodEnd;
}

// LocalStorage functions
export function loadTimers(): Timer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TIMERS);
    if (stored) {
      const timers = JSON.parse(stored) as Timer[];
      // Recalculate elapsed time for running timers
      return timers.map(timer => {
        if (timer.status === 'running' && timer.startTime) {
          const additionalTime = Date.now() - timer.startTime;
          return {
            ...timer,
            startTime: Date.now(),
            elapsedTime: timer.elapsedTime + additionalTime
          };
        }
        return timer;
      });
    }
  } catch (e) {
    console.error('Error loading timers:', e);
  }
  return DEFAULT_TIMERS;
}

export function saveTimers(timers: Timer[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TIMERS, JSON.stringify(timers));
  } catch (e) {
    console.error('Error saving timers:', e);
  }
}

export function loadActivityLog(): ActivityLogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVITY_LOG);
    if (stored) {
      return JSON.parse(stored) as ActivityLogEntry[];
    }
  } catch (e) {
    console.error('Error loading activity log:', e);
  }
  return [];
}

export function saveActivityLog(log: ActivityLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_LOG, JSON.stringify(log));
  } catch (e) {
    console.error('Error saving activity log:', e);
  }
}

export function addActivityLogEntry(
  log: ActivityLogEntry[],
  timerId: string,
  timerName: string,
  action: ActivityLogEntry['action']
): ActivityLogEntry[] {
  const entry: ActivityLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    timerId,
    timerName,
    action,
  };
  
  const newLog = [entry, ...log].slice(0, 500); // Keep last 500 entries
  saveActivityLog(newLog);
  return newLog;
}

export function loadDailyStats(): DailyStats[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DAILY_STATS);
    if (stored) {
      return JSON.parse(stored) as DailyStats[];
    }
  } catch (e) {
    console.error('Error loading daily stats:', e);
  }
  return [];
}

export function saveDailyStats(stats: DailyStats[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DAILY_STATS, JSON.stringify(stats));
  } catch (e) {
    console.error('Error saving daily stats:', e);
  }
}

export function updateDailyStats(timerId: string, elapsedTime: number): void {
  const stats = loadDailyStats();
  const periodKey = getDailyPeriodKey();
  
  const existingIndex = stats.findIndex(s => s.date === periodKey);
  
  if (existingIndex >= 0) {
    stats[existingIndex].timers[timerId] = (stats[existingIndex].timers[timerId] || 0) + elapsedTime;
  } else {
    stats.push({
      date: periodKey,
      timers: { [timerId]: elapsedTime }
    });
  }
  
  // Keep only last 30 days
  const sortedStats = stats.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  saveDailyStats(sortedStats);
}

export function getCurrentDayStats(): DailyStats | null {
  const stats = loadDailyStats();
  const periodKey = getDailyPeriodKey();
  return stats.find(s => s.date === periodKey) || null;
}

export function getStatusLabel(status: TimerStatus): string {
  switch (status) {
    case 'running': return 'Running';
    case 'paused': return 'Paused';
    case 'stopped': return 'Stopped';
    default: return 'Idle';
  }
}
