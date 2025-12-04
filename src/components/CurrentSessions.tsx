import { Timer } from '@/types/timer';
import { formatTime } from '@/lib/timerUtils';
import { Activity, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CurrentSessionsProps {
  timers: Timer[];
  compact?: boolean;
}

export function CurrentSessions({ timers, compact }: CurrentSessionsProps) {
  const activeTimers = timers.filter(t => t.status === 'running' || t.status === 'warning' || t.status === 'finished');

  if (compact && activeTimers.length === 0) return null;

  const getSessionStyle = (status: Timer['status']) => {
    switch (status) {
      case 'running': return 'bg-success/5 border-success/30';
      case 'warning': return 'bg-warning/10 border-warning/50';
      case 'finished': return 'bg-destructive/10 border-destructive/50';
      default: return 'bg-muted border-border';
    }
  };

  const getDotColor = (status: Timer['status']) => {
    switch (status) {
      case 'running': return 'bg-success';
      case 'warning': return 'bg-warning';
      case 'finished': return 'bg-destructive';
      default: return 'bg-muted-foreground';
    }
  };

  const getTextColor = (status: Timer['status']) => {
    switch (status) {
      case 'running': return 'text-success';
      case 'warning': return 'text-warning';
      case 'finished': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className={cn("gaming-card", compact && "p-4")}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("rounded-lg bg-primary/10 border border-primary/20", compact ? "p-1.5" : "p-2")}>
          <Activity className={cn("text-primary", compact ? "w-4 h-4" : "w-5 h-5")} />
        </div>
        <h2 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-xl")}>Активные сессии</h2>
        {activeTimers.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            {activeTimers.length}
          </span>
        )}
      </div>

      {activeTimers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
          <Clock className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-sm">Нет активных сессий</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeTimers.map(timer => (
            <div
              key={timer.id}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border transition-all',
                getSessionStyle(timer.status)
              )}
            >
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-2 h-2 rounded-full animate-pulse',
                  getDotColor(timer.status)
                )} />
                <span className="font-medium text-foreground text-sm">{timer.name}</span>
              </div>
              <span className={cn(
                'font-mono text-lg font-semibold',
                getTextColor(timer.status)
              )}>
                {formatTime(timer.remainingTime)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
