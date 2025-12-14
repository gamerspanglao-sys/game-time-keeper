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
import { Label } from '@/components/ui/label';
import { Users, UserPlus, X, Clock, Check, CreditCard } from 'lucide-react';
import { QueueEntry } from '@/types/queue';

interface QueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  timerName: string;
  timerId: string;
  queue: QueueEntry[];
  remainingTime: number; // in ms
  onAddToQueue: (timerId: string, name: string, hours: number) => void;
  onRemoveFromQueue: (timerId: string, entryId: string) => void;
}

const CLEANUP_BUFFER_MS = 3 * 60 * 1000; // 3 minutes cleanup time

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
  const [selectedHours, setSelectedHours] = useState(1);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingHours, setPendingHours] = useState(1);

  const handleAdd = () => {
    if (newName.trim()) {
      setPendingName(newName.trim());
      setPendingHours(selectedHours);
      setShowPaymentConfirm(true);
    }
  };

  const handleConfirmPayment = () => {
    onAddToQueue(timerId, pendingName, pendingHours);
    setNewName('');
    setSelectedHours(1);
    setPendingName('');
    setPendingHours(1);
    setShowPaymentConfirm(false);
  };

  const handleCancelPayment = () => {
    setPendingName('');
    setPendingHours(1);
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
    // Calculate wait based on hours of people ahead
    let waitTime = remainingTime + CLEANUP_BUFFER_MS;
    for (let i = 0; i < index; i++) {
      const entry = queue[i];
      waitTime += (entry.hours * 60 * 60 * 1000) + CLEANUP_BUFFER_MS;
    }
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
              Prepayment Confirmation
            </DialogTitle>
            <DialogDescription>
              Confirm prepayment before adding to queue
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground mb-2">
                {pendingName}
              </p>
              <p className="text-2xl font-bold text-primary mb-2">
                {pendingHours} {pendingHours === 1 ? 'hour' : 'hours'}
              </p>
              <p className="text-muted-foreground">
                Has this person prepaid for {pendingHours} {pendingHours === 1 ? 'hour' : 'hours'}?
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="success"
                className="flex-1"
                onClick={handleConfirmPayment}
              >
                <Check className="w-4 h-4 mr-2" />
                Yes, prepaid
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
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Enter name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
            </div>
            
            {/* Hours selector */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Prepaid hours</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((hours) => (
                  <Button
                    key={hours}
                    variant={selectedHours === hours ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setSelectedHours(hours)}
                  >
                    {hours}h
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={handleAdd} disabled={!newName.trim()} className="w-full">
              <UserPlus className="w-4 h-4 mr-2" />
              Add to Queue ({selectedHours}h prepaid)
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
                      <p className="font-medium text-foreground">
                        {entry.name}
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                          {entry.hours}h
                        </span>
                      </p>
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