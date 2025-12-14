import { useState } from 'react';
import { Timer, DURATION_PRESETS, TimerCategory } from '@/types/timer';
import { formatTime, getStatusLabel } from '@/lib/timerUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Square, RotateCcw, Plus, Users, Circle, Gamepad2, Crown, Pencil, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CloseoutDialog } from './CloseoutDialog';
import { QueueDialog } from './QueueDialog';
import { QueueConfirmDialog } from './QueueConfirmDialog';
import { PaymentTypeDialog } from './PaymentTypeDialog';
import { QueueEntry } from '@/types/queue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const ADMIN_PASSWORD = '8808';

interface TimerCardProps {
  timer: Timer;
  onStart: (id: string, paymentType: 'prepaid' | 'postpaid') => void;
  onStop: (id: string) => void;
  onExtend: (id: string, additionalMinutes?: number, paymentType?: 'prepaid' | 'postpaid') => void;
  onReset: (id: string) => void;
  onSetDuration: (id: string, minutes: number) => void;
  onAdjustTime: (id: string, minutes: number) => void;
  playConfirmSound: () => void;
  stopAlarm: (id: string) => void;
  notifyQueueNext?: (timerName: string, personName: string) => void;
  compact?: boolean;
  queue: QueueEntry[];
  onAddToQueue: (timerId: string, name: string, hours: number) => void;
  onRemoveFromQueue: (timerId: string, entryId: string) => void;
}

export function TimerCard({ 
  timer, 
  onStart, 
  onStop, 
  onExtend, 
  onReset, 
  onSetDuration, 
  onAdjustTime,
  playConfirmSound,
  stopAlarm,
  notifyQueueNext,
  compact,
  queue,
  onAddToQueue,
  onRemoveFromQueue
}: TimerCardProps) {
  const { id, name, status, remainingTime, duration, category, paidAmount, unpaidAmount } = timer;
  const [showCloseout, setShowCloseout] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showQueueConfirm, setShowQueueConfirm] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showExtendPaymentDialog, setShowExtendPaymentDialog] = useState(false);
  const [pendingPaymentType, setPendingPaymentType] = useState<'prepaid' | 'postpaid' | null>(null);
  const [adjustPassword, setAdjustPassword] = useState('');
  const [adjustMinutes, setAdjustMinutes] = useState(10);
  const [passwordError, setPasswordError] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleAdjustClick = () => {
    setShowAdjust(true);
    setAdjustPassword('');
    setPasswordError(false);
    setIsAuthenticated(false);
  };

  const handlePasswordSubmit = () => {
    if (adjustPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleAdjustTime = (minutes: number) => {
    onAdjustTime(id, minutes);
    playConfirmSound();
  };

  const handleCloseAdjust = () => {
    setShowAdjust(false);
    setAdjustPassword('');
    setIsAuthenticated(false);
    setPasswordError(false);
  };

  const getCategoryIcon = () => {
    switch (category) {
      case 'billiard': return <Circle className="w-4 h-4" />;
      case 'playstation': return <Gamepad2 className="w-4 h-4" />;
      case 'vip': return <Crown className="w-4 h-4" />;
    }
  };

  const getCategoryClass = () => {
    switch (category) {
      case 'billiard': return 'gaming-card-table';
      case 'playstation': return 'gaming-card-playstation';
      case 'vip': return 'gaming-card-vip';
    }
  };

  const getCategoryBadgeClass = () => {
    switch (category) {
      case 'billiard': return 'category-badge-table';
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
    
    // Stop alarm when closing out
    stopAlarm(id);
    
    // Notify next person in queue if exists
    if (queue.length > 0 && notifyQueueNext) {
      notifyQueueNext(name, queue[0].name);
    }
    
    // Stop and reset timer normally after closeout
    onStop(id);
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
        <div className="relative flex items-center justify-center">
          <div className={cn(
            'font-mono font-bold tracking-wider text-center',
            compact ? 'text-4xl' : 'text-5xl md:text-6xl',
            getTimerDisplayClass()
          )}>
            {formatTime(remainingTime)}
          </div>
          {/* Edit time button - only show when timer is active */}
          {isActive && (
            <button
              onClick={handleAdjustClick}
              className="absolute right-0 p-1.5 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
              title="Adjust time (admin)"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
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
              onClick={() => setShowPaymentDialog(true)}
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
                onClick={() => setShowExtendPaymentDialog(true)}
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
              onClick={() => {
                stopAlarm(id);
                onReset(id);
              }}
              className="flex-1"
            >
              <RotateCcw className="w-5 h-5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Payment Type Dialog for Start */}
      <PaymentTypeDialog
        isOpen={showPaymentDialog}
        timerName={name}
        timerId={id}
        durationMinutes={Math.ceil(duration / (60 * 1000))}
        onSelect={(type) => {
          setShowPaymentDialog(false);
          // Check if there's someone in queue
          if (queue.length > 0) {
            setPendingPaymentType(type);
            setShowQueueConfirm(true);
          } else {
            onStart(id, type);
          }
        }}
        onCancel={() => setShowPaymentDialog(false)}
      />

      {/* Queue Confirmation Dialog */}
      <QueueConfirmDialog
        isOpen={showQueueConfirm}
        timerName={name}
        personName={queue[0]?.name || ''}
        onConfirm={() => {
          // Remove person from queue and start timer
          if (queue[0]) {
            onRemoveFromQueue(id, queue[0].id);
          }
          if (pendingPaymentType) {
            onStart(id, pendingPaymentType);
          }
          setShowQueueConfirm(false);
          setPendingPaymentType(null);
        }}
        onDeny={() => {
          // Just start timer without removing from queue
          if (pendingPaymentType) {
            onStart(id, pendingPaymentType);
          }
          setShowQueueConfirm(false);
          setPendingPaymentType(null);
        }}
      />

      {/* Payment Type Dialog for Extend */}
      <PaymentTypeDialog
        isOpen={showExtendPaymentDialog}
        timerName={name}
        timerId={id}
        durationMinutes={60}
        isExtension={true}
        onSelect={(type) => {
          setShowExtendPaymentDialog(false);
          onExtend(id, 60, type);
        }}
        onCancel={() => setShowExtendPaymentDialog(false)}
      />

      {/* Closeout Dialog */}
      <CloseoutDialog
        isOpen={showCloseout}
        timerName={name}
        timerId={id}
        duration={duration}
        remainingTime={remainingTime}
        paidAmount={paidAmount}
        unpaidAmount={unpaidAmount}
        onComplete={handleCloseoutComplete}
        onCancel={handleCloseoutCancel}
        playConfirmSound={playConfirmSound}
        stopAlarm={() => stopAlarm(id)}
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

      {/* Adjust Time Dialog */}
      <Dialog open={showAdjust} onOpenChange={(open) => !open && handleCloseAdjust()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Time</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          
          {!isAuthenticated ? (
            <div className="space-y-4 pt-2">
              <Input
                type="password"
                placeholder="Enter admin password"
                value={adjustPassword}
                onChange={(e) => setAdjustPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                className={cn(passwordError && "border-destructive")}
              />
              {passwordError && (
                <p className="text-sm text-destructive">Wrong password</p>
              )}
              <Button onClick={handlePasswordSubmit} className="w-full">
                Confirm
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="text-center text-lg font-mono text-foreground">
                Current: {formatTime(remainingTime)}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(-1)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  1 min
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(1)}
                  className="text-success border-success/30 hover:bg-success/10"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  1 min
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(-5)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  5 min
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(5)}
                  className="text-success border-success/30 hover:bg-success/10"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  5 min
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(-10)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  10 min
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleAdjustTime(10)}
                  className="text-success border-success/30 hover:bg-success/10"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  10 min
                </Button>
              </div>
              
              <Button variant="secondary" onClick={handleCloseAdjust} className="w-full">
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
