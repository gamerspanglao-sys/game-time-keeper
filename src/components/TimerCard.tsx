import { Timer, DURATION_PRESETS } from '@/types/timer';
import { formatTime, getStatusLabel } from '@/lib/timerUtils';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimerCardProps {
  timer: Timer;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onExtend: (id: string) => void;
  onReset: (id: string) => void;
  onSetDuration: (id: string, minutes: number) => void;
  compact?: boolean;
}

export function TimerCard({ timer, onStart, onStop, onExtend, onReset, onSetDuration, compact }: TimerCardProps) {
  const { id, name, status, remainingTime, duration } = timer;

  const getTimerDisplayClass = () => {
    switch (status) {
      case 'running': return 'timer-display-running';
      case 'warning': return 'timer-display-warning animate-pulse';
      case 'finished': return 'timer-display-finished animate-pulse';
      case 'stopped': return 'timer-display-stopped';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'running': return 'status-badge-running';
      case 'warning': return 'status-badge-warning';
      case 'finished': return 'status-badge-finished';
      case 'stopped': return 'status-badge-stopped';
      default: return 'status-badge-idle';
    }
  };

  const getCardClass = () => {
    switch (status) {
      case 'warning': return 'gaming-card-warning';
      case 'finished': return 'gaming-card-finished';
      case 'running': return 'gaming-card-active';
      default: return '';
    }
  };

  const isActive = status === 'running' || status === 'warning' || status === 'finished';
  const progress = duration > 0 ? ((duration - remainingTime) / duration) * 100 : 0;

  const getProgressBarClass = () => {
    if (status === 'finished') return 'bg-destructive';
    if (status === 'warning') return 'bg-warning';
    return 'bg-gradient-to-r from-primary to-success';
  };

  return (
    <div className={cn(
      'gaming-card flex flex-col gap-4',
      getCardClass(),
      compact && 'p-4'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-xl")}>{name}</h3>
        <span className={cn('status-badge', getStatusBadgeClass())}>
          {getStatusLabel(status)}
        </span>
      </div>

      {/* Progress Bar */}
      {isActive && (
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-1000", getProgressBarClass())}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}

      {/* Timer Display */}
      <div className={cn(
        'font-mono font-bold tracking-wider text-center',
        compact ? 'text-4xl' : 'text-5xl md:text-6xl',
        getTimerDisplayClass()
      )}>
        {formatTime(remainingTime)}
      </div>

      {/* Duration Presets - Only show when idle */}
      {status === 'idle' && (
        <div className="flex flex-wrap gap-2 justify-center">
          {DURATION_PRESETS.map(minutes => (
            <button
              key={minutes}
              onClick={() => onSetDuration(id, minutes)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                duration === minutes * 60 * 1000
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {minutes / 60}ч
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        {(status === 'idle' || status === 'stopped') && (
          <Button 
            variant="success" 
            size={compact ? "default" : "lg"}
            onClick={() => onStart(id)}
            className="flex-1"
          >
            <Play className="w-5 h-5" />
            Старт
          </Button>
        )}

        {(status === 'running' || status === 'warning' || status === 'finished') && (
          <>
            <Button 
              variant="destructive" 
              size={compact ? "default" : "lg"}
              onClick={() => onStop(id)}
              className="flex-1"
            >
              <Square className="w-5 h-5" />
              Завершить
            </Button>
            <Button 
              variant="timer" 
              size={compact ? "default" : "lg"}
              onClick={() => onExtend(id)}
              className="flex-1"
            >
              <Plus className="w-5 h-5" />
              +1 час
            </Button>
          </>
        )}

        {status === 'stopped' && (
          <Button 
            variant="timer" 
            size={compact ? "default" : "lg"}
            onClick={() => onReset(id)}
            className="flex-1"
          >
            <RotateCcw className="w-5 h-5" />
            Сброс
          </Button>
        )}
      </div>
    </div>
  );
}
