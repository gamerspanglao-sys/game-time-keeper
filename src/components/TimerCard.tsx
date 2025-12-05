import { useState } from 'react';
import { Timer, DURATION_PRESETS, TimerCategory } from '@/types/timer';
import { formatTime, getStatusLabel } from '@/lib/timerUtils';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Plus, Users, Circle, Gamepad2, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CloseoutDialog } from './CloseoutDialog';
import { QueueDialog } from './QueueDialog';
import { QueueEntry } from '@/types/queue';
interface TimerCardProps {
  timer: Timer;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onExtend: (id: string) => void;
  onReset: (id: string) => void;
  onSetDuration: (id: string, minutes: number) => void;
  playConfirmSound: () => void;
  compact?: boolean;
  queue: QueueEntry[];
  onAddToQueue: (timerId: string, name: string) => void;
  onRemoveFromQueue: (timerId: string, entryId: string) => void;
}

export function TimerCard({ 
  timer, 
  onStart, 
  onStop, 
  onExtend, 
  onReset, 
  onSetDuration, 
  playConfirmSound,
  compact,
  queue,
  onAddToQueue,
  onRemoveFromQueue
}: TimerCardProps) {
  const { id, name, status, remainingTime, duration, category } = timer;
  const [showCloseout, setShowCloseout] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  const getCategoryIcon = () => {
    switch (category) {
      case 'table': return <Circle className="w-4 h-4" />;
      case 'playstation': return <Gamepad2 className="w-4 h-4" />;
      case 'vip': return <Crown className="w-4 h-4" />;
    }
  };

  const getCategoryClass = () => {
    switch (category) {
      case 'table': return 'gaming-card-table';
      case 'playstation': return 'gaming-card-playstation';
      case 'vip': return 'gaming-card-vip';
    }
  };

  const getCategoryBadgeClass = () => {
    switch (category) {
      case 'table': return 'category-badge-table';
      case 'playstation': return 'category-badge-playstation';
      case 'vip': return 'category-badge-vip';
    }
  };
  const getTimerDisplayClass = () => {
    switch (status) {
      case 'running': return 'timer-display-running';
      case 'warning': return 'timer-display-warning animate-bounce';
      case 'finished': return 'timer-display-finished animate-pulse scale-110';
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

  const handleEndClick = () => {
    setShowCloseout(true);
  };

  const handleCloseoutComplete = () => {
    setShowCloseout(false);
    onStop(id);
    // Reset timer to idle state after closeout
    setTimeout(() => onReset(id), 100);
  };

  const handleCloseoutCancel = () => {
    setShowCloseout(false);
  };

  return (
    <>
      <div className={cn(
        'gaming-card flex flex-col gap-4',
        getCategoryClass(),
        getCardClass(),
        compact && 'p-4'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("p-1.5 rounded-lg", getCategoryBadgeClass())}>
              {getCategoryIcon()}
            </span>
            <h3 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-xl")}>{name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Queue button */}
            <button
              onClick={() => setShowQueue(true)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all",
                queue.length > 0
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              <Users className="w-3 h-3" />
              {queue.length > 0 && <span>{queue.length}</span>}
            </button>
            <span className={cn('status-badge', getStatusBadgeClass())}>
              {getStatusLabel(status)}
            </span>
          </div>
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
                {minutes / 60}h
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

          {(status === 'running' || status === 'warning' || status === 'finished') && (
            <>
              <Button 
                variant="destructive" 
                size={compact ? "default" : "lg"}
                onClick={handleEndClick}
                className="flex-1"
              >
                <Square className="w-5 h-5" />
                End
              </Button>
              <Button 
                variant="timer" 
                size={compact ? "default" : "lg"}
                onClick={() => onExtend(id)}
                className="flex-1"
              >
                <Plus className="w-5 h-5" />
                +1 hour
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
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Closeout Dialog */}
      <CloseoutDialog
        isOpen={showCloseout}
        timerName={name}
        timerId={id}
        duration={duration}
        onComplete={handleCloseoutComplete}
        onCancel={handleCloseoutCancel}
        playConfirmSound={playConfirmSound}
      />

      {/* Queue Dialog */}
      <QueueDialog
        isOpen={showQueue}
        onClose={() => setShowQueue(false)}
        timerName={name}
        timerId={id}
        queue={queue}
        remainingTime={remainingTime}
        onAddToQueue={onAddToQueue}
        onRemoveFromQueue={onRemoveFromQueue}
      />
    </>
  );
}
