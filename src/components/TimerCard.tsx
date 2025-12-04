import { Timer } from '@/types/timer';
import { formatTime, getStatusLabel } from '@/lib/timerUtils';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimerCardProps {
  timer: Timer;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onReset: (id: string) => void;
}

export function TimerCard({ timer, onStart, onPause, onResume, onStop, onReset }: TimerCardProps) {
  const { id, name, status, elapsedTime } = timer;

  const getTimerDisplayClass = () => {
    switch (status) {
      case 'running': return 'timer-display-running';
      case 'paused': return 'timer-display-paused';
      case 'stopped': return 'timer-display-stopped';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadgeClass = () => {
    switch (status) {
      case 'running': return 'status-badge-running';
      case 'paused': return 'status-badge-paused';
      case 'stopped': return 'status-badge-stopped';
      default: return 'status-badge-idle';
    }
  };

  const isActive = status === 'running' || status === 'paused';

  return (
    <div className={cn(
      'gaming-card flex flex-col items-center gap-6',
      isActive && 'gaming-card-active'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <h3 className="text-xl font-semibold text-foreground">{name}</h3>
        <span className={cn('status-badge', getStatusBadgeClass())}>
          {getStatusLabel(status)}
        </span>
      </div>

      {/* Timer Display */}
      <div className={cn('timer-display', getTimerDisplayClass())}>
        {formatTime(elapsedTime)}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 w-full">
        {status === 'idle' && (
          <Button 
            variant="success" 
            size="lg" 
            onClick={() => onStart(id)}
            className="flex-1 min-w-[100px]"
          >
            <Play className="w-5 h-5" />
            Start
          </Button>
        )}

        {status === 'running' && (
          <>
            <Button 
              variant="warning" 
              size="lg" 
              onClick={() => onPause(id)}
              className="flex-1 min-w-[100px]"
            >
              <Pause className="w-5 h-5" />
              Pause
            </Button>
            <Button 
              variant="destructive" 
              size="lg" 
              onClick={() => onStop(id)}
              className="flex-1 min-w-[100px]"
            >
              <Square className="w-5 h-5" />
              Stop
            </Button>
          </>
        )}

        {status === 'paused' && (
          <>
            <Button 
              variant="success" 
              size="lg" 
              onClick={() => onResume(id)}
              className="flex-1 min-w-[100px]"
            >
              <Play className="w-5 h-5" />
              Resume
            </Button>
            <Button 
              variant="destructive" 
              size="lg" 
              onClick={() => onStop(id)}
              className="flex-1 min-w-[100px]"
            >
              <Square className="w-5 h-5" />
              Stop
            </Button>
          </>
        )}

        {status === 'stopped' && (
          <>
            <Button 
              variant="success" 
              size="lg" 
              onClick={() => onStart(id)}
              className="flex-1 min-w-[100px]"
            >
              <Play className="w-5 h-5" />
              Start
            </Button>
            <Button 
              variant="timer" 
              size="lg" 
              onClick={() => onReset(id)}
              className="flex-1 min-w-[100px]"
            >
              <RotateCcw className="w-5 h-5" />
              Reset
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
