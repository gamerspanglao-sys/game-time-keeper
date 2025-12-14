import { useState } from 'react';
import { Timer } from '@/types/timer';
import { formatTime } from '@/lib/timerUtils';
import { Activity, Clock, Circle, Gamepad2, Crown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface CurrentSessionsProps {
  timers: Timer[];
  compact?: boolean;
  onReset?: (timerId: string) => void;
  onStopAlarm?: (timerId: string) => void;
  overtimeByTimer?: Record<string, number>;
}

const ADMIN_PASSWORD = '8808';

export function CurrentSessions({ timers, compact, onReset, onStopAlarm, overtimeByTimer = {} }: CurrentSessionsProps) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Show only active timers (running, warning, finished)
  const activeTimers = timers.filter(t => 
    t.status === 'running' || 
    t.status === 'warning' || 
    t.status === 'finished'
  );

  if (compact && activeTimers.length === 0) return null;

  const getSessionStyle = (timer: Timer) => {
    switch (timer.status) {
      case 'running': return 'bg-success/5 border-success/30';
      case 'warning': return 'bg-warning/10 border-warning/50';
      case 'finished': return 'bg-destructive/10 border-destructive/50';
      default: return 'bg-muted border-border';
    }
  };

  const getDotColor = (timer: Timer) => {
    switch (timer.status) {
      case 'running': return 'bg-success';
      case 'warning': return 'bg-warning';
      case 'finished': return 'bg-destructive';
      default: return 'bg-muted-foreground';
    }
  };

  const getTextColor = (status: Timer['status'], remainingTime: number) => {
    if (remainingTime < 0) return 'text-destructive';
    switch (status) {
      case 'running': return 'text-success';
      case 'warning': return 'text-warning';
      case 'finished': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getCategoryIcon = (category: Timer['category']) => {
    switch (category) {
      case 'billiard': return <Circle className="w-3.5 h-3.5" />;
      case 'playstation': return <Gamepad2 className="w-3.5 h-3.5" />;
      case 'vip': return <Crown className="w-3.5 h-3.5" />;
    }
  };

  const getCategoryBadgeClass = (category: Timer['category']) => {
    switch (category) {
      case 'billiard': return 'bg-success/15 text-success';
      case 'playstation': return 'bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,60%)]';
      case 'vip': return 'bg-[hsl(280,65%,60%)]/15 text-[hsl(280,65%,60%)]';
    }
  };

  const formatOvertimeDisplay = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `+${hours}h ${mins}m` : `+${hours}h`;
    }
    return `+${minutes}m`;
  };

  const handleResetClick = (timerId: string) => {
    setSelectedTimerId(timerId);
    setPassword('');
    setError('');
    setPasswordDialogOpen(true);
  };

  const handlePasswordSubmit = () => {
    if (password === ADMIN_PASSWORD) {
      if (selectedTimerId) {
        if (onStopAlarm) onStopAlarm(selectedTimerId);
        if (onReset) onReset(selectedTimerId);
      }
      setPasswordDialogOpen(false);
      setPassword('');
      setError('');
    } else {
      setError('Wrong password');
    }
  };

  return (
    <>
      <div className={cn("gaming-card", compact && "p-4")}>
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("rounded-lg bg-primary/10 border border-primary/20", compact ? "p-1.5" : "p-2")}>
            <Activity className={cn("text-primary", compact ? "w-4 h-4" : "w-5 h-5")} />
          </div>
          <h2 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-xl")}>Current Sessions</h2>
          {activeTimers.length > 0 && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              {activeTimers.length}
            </span>
          )}
        </div>

        {activeTimers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
            <Clock className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">No active sessions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTimers.map(timer => (
              <div
                key={timer.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-all',
                  getSessionStyle(timer)
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("p-1 rounded", getCategoryBadgeClass(timer.category))}>
                    {getCategoryIcon(timer.category)}
                  </span>
                  <div className={cn(
                    'w-2 h-2 rounded-full animate-pulse',
                    getDotColor(timer)
                  )} />
                  <span className="font-medium text-foreground text-sm">{timer.name}</span>
                  {/* Overtime badge */}
                  {overtimeByTimer[timer.id] > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-destructive/15 text-destructive">
                      {formatOvertimeDisplay(overtimeByTimer[timer.id])}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-mono text-lg font-semibold',
                    getTextColor(timer.status, timer.remainingTime),
                    timer.remainingTime < 0 && 'animate-pulse'
                  )}>
                    {formatTime(timer.remainingTime)}
                  </span>
                  {/* Reset button for finished timers */}
                  {timer.status === 'finished' && onReset && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResetClick(timer.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Admin Password Required</DialogTitle>
            <DialogDescription>
              Enter admin password to reset this timer
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPasswordDialogOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handlePasswordSubmit} className="flex-1">
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}