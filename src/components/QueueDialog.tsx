import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, UserPlus, X, Clock, Check, CreditCard } from 'lucide-react';
import { QueueEntry } from '@/types/queue';

interface QueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  timerName: string;
  timerId: string;
  queue: QueueEntry[];
  remainingTime: number; // in ms
  onAddToQueue: (timerId: string, name: string) => void;
  onRemoveFromQueue: (timerId: string, entryId: string) => void;
}

const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 hour default session

export function QueueDialog({
  isOpen,
  onClose,
  timerName,
  timerId,
  queue,
  remainingTime,
  onAddToQueue,
  onRemoveFromQueue,
}: QueueDialogProps) {
  const [newName, setNewName] = useState('');
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [pendingName, setPendingName] = useState('');

  const handleAdd = () => {
    if (newName.trim()) {
      setPendingName(newName.trim());
      setShowPaymentConfirm(true);
    }
  };

  const handleConfirmPayment = () => {
    onAddToQueue(timerId, pendingName);
    setNewName('');
    setPendingName('');
    setShowPaymentConfirm(false);
  };

  const handleCancelPayment = () => {
    setPendingName('');
    setShowPaymentConfirm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  // Calculate estimated start time for each person in queue
  const getEstimatedStartTime = (index: number) => {
    const now = Date.now();
    // First person: remaining time on current session
    // Others: add 1 hour session for each person ahead
    const waitTime = remainingTime + (index * SESSION_DURATION_MS);
    return new Date(now + waitTime);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Payment confirmation dialog
  if (showPaymentConfirm) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Payment Confirmation
            </DialogTitle>
            <DialogDescription>
              Confirm payment before adding to queue
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground mb-2">
                {pendingName}
              </p>
              <p className="text-muted-foreground">
                Has this person paid for the session?
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="success"
                className="flex-1"
                onClick={handleConfirmPayment}
              >
                <Check className="w-4 h-4 mr-2" />
                Yes, paid
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancelPayment}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Queue for {timerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add to queue */}
          <div className="flex gap-2">
            <Input
              placeholder="Enter name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleAdd} disabled={!newName.trim()}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>

          {/* Queue list */}
          <div className="space-y-2">
            {queue.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No one in queue
              </p>
            ) : (
              queue.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    index === 0
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-secondary/30 border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Start ~{formatTime(getEstimatedStartTime(index))}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveFromQueue(timerId, entry.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {queue.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {queue.length} {queue.length === 1 ? 'person' : 'people'} waiting
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
