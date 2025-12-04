import { Timer } from '@/types/timer';
import { formatTime } from '@/lib/timerUtils';
import { Activity, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CurrentSessionsProps {
  timers: Timer[];
}

export function CurrentSessions({ timers }: CurrentSessionsProps) {
  const activeTimers = timers.filter(t => t.status === 'running' || t.status === 'paused');

  return (
    <div className="gaming-card">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Current Sessions</h2>
        {activeTimers.length > 0 && (
          <span className="ml-auto px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            {activeTimers.length} active
          </span>
        )}
      </div>

      {activeTimers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Clock className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-lg">No active sessions</p>
          <p className="text-sm">Start a timer to begin tracking</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeTimers.map(timer => (
            <div
              key={timer.id}
              className={cn(
                'flex items-center justify-between p-4 rounded-lg border transition-all',
                timer.status === 'running' 
                  ? 'bg-success/5 border-success/30' 
                  : 'bg-warning/5 border-warning/30'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  timer.status === 'running' ? 'bg-success animate-pulse' : 'bg-warning'
                )} />
                <span className="font-medium text-foreground">{timer.name}</span>
                <span className={cn(
                  'status-badge text-xs',
                  timer.status === 'running' ? 'status-badge-running' : 'status-badge-paused'
                )}>
                  {timer.status === 'running' ? 'Running' : 'Paused'}
                </span>
              </div>
              <span className={cn(
                'font-mono text-xl font-semibold',
                timer.status === 'running' ? 'text-success' : 'text-warning'
              )}>
                {formatTime(timer.elapsedTime)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
