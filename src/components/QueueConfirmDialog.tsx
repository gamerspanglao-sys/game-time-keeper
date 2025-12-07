import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users, Check, X } from 'lucide-react';

interface QueueConfirmDialogProps {
  isOpen: boolean;
  timerName: string;
  personName: string;
  onConfirm: () => void;
  onDeny: () => void;
}

export function QueueConfirmDialog({
  isOpen,
  timerName,
  personName,
  onConfirm,
  onDeny,
}: QueueConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Queue Confirmation
          </DialogTitle>
          <DialogDescription>
            Next in queue for {timerName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground mb-2">
              {personName}
            </p>
            <p className="text-muted-foreground">
              Is this person taking the table?
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              variant="success"
              className="flex-1"
              onClick={onConfirm}
            >
              <Check className="w-4 h-4 mr-2" />
              Yes, remove from queue
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={onDeny}
            >
              <X className="w-4 h-4 mr-2" />
              No
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
