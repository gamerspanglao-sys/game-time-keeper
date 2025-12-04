import { Timer, DURATION_PRESETS } from '@/types/timer';
import { formatTime, getStatusLabel } from '@/lib/timerUtils';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimerCardProps {
  timer: Timer;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onReset: (id: string) => void;
  onSetDuration: (id: string, minutes: number) => void;
  compact?: boolean;
}

export function TimerCard({ timer, onStart, onStop, onReset, onSetDuration, compact }: TimerCardProps) {
  const { id, name, status, remainingTime, duration } = timer;

  const getTimerDisplayClass = () => {
    switch (status) {
      case 'running': return 'timer-display-running';
      case 'finished': return 'timer-display-stopped animate-pulse';
      case 'stopped': return 'timer-display-stopped';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'running': return 'status-badge-running';
      case 'finished': return 'status-badge-stopped';
      case 'stopped': return 'status-badge-stopped';
      default: return 'status-badge-idle';
    }
  };

  const isActive = status === 'running' || status === 'finished';
  const progress = duration > 0 ? ((duration - remainingTime) / duration) * 100 : 0;

  return (
    <div className={cn(
      'gaming-card flex flex-col gap-4',
      isActive && 'gaming-card-active',
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
      {status === 'running' && (
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-success rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
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
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                duration === minutes * 60 * 1000
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`}
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
            Start
          </Button>
        )}

        {(status === 'running' || status === 'finished') && (
          <Button 
            variant="destructive" 
            size={compact ? "default" : "lg"}
            onClick={() => onStop(id)}
            className="flex-1"
          >
            <Square className="w-5 h-5" />
            Stop
          </Button>
        )}

        {(status === 'stopped' || status === 'finished') && (
          <Button 
            variant="timer" 
            size={compact ? "default" : "lg"}
            onClick={() => onReset(id)}
            className="flex-1"
          >
            <RotateCcw className="w-5 h-5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
