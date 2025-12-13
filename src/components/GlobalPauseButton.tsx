import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ADMIN_PASSWORD = '8808';

interface GlobalPauseButtonProps {
  isPaused: boolean;
  activeTimersCount: number;
  onPauseAll: () => void;
  onResumeAll: () => void;
}

export function GlobalPauseButton({
  isPaused,
  activeTimersCount,
  onPauseAll,
  onResumeAll,
}: GlobalPauseButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const handleClick = () => {
    if (activeTimersCount === 0 && !isPaused) return;
    setShowDialog(true);
    setPassword('');
    setPasswordError(false);
  };

  const handleConfirm = () => {
    if (password === ADMIN_PASSWORD) {
      if (isPaused) {
        onResumeAll();
      } else {
        onPauseAll();
      }
      setShowDialog(false);
      setPassword('');
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // Don't show if no active timers and not paused
  if (activeTimersCount === 0 && !isPaused) return null;

  return (
    <>
      <Button
        variant={isPaused ? 'success' : 'destructive'}
        size="sm"
        onClick={handleClick}
        className={cn(
          'flex items-center gap-2 font-semibold',
          isPaused && 'animate-pulse'
        )}
      >
        {isPaused ? (
          <>
            <Play className="w-4 h-4" />
            Resume All
          </>
        ) : (
          <>
            <Pause className="w-4 h-4" />
            Pause All
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isPaused ? (
                <>
                  <Play className="w-5 h-5 text-success" />
                  Resume All Timers
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5 text-destructive" />
                  Pause All Timers
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {isPaused
                ? 'Enter admin password to resume all paused timers.'
                : `This will pause ${activeTimersCount} active timer${activeTimersCount > 1 ? 's' : ''}. Use this for power outages or emergencies.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <Input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className={cn(passwordError && 'border-destructive')}
              autoFocus
            />
            {passwordError && (
              <p className="text-sm text-destructive">Wrong password</p>
            )}
            <Button
              onClick={handleConfirm}
              variant={isPaused ? 'success' : 'destructive'}
              className="w-full"
            >
              {isPaused ? 'Resume All Timers' : 'Pause All Timers'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
