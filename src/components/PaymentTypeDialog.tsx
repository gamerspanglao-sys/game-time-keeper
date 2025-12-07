import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Banknote, CreditCard, Clock } from 'lucide-react';
import { TIMER_PRICING } from '@/lib/timerUtils';

interface PaymentTypeDialogProps {
  isOpen: boolean;
  timerName: string;
  timerId: string;
  durationMinutes: number;
  isExtension?: boolean;
  onSelect: (type: 'prepaid' | 'postpaid') => void;
  onCancel: () => void;
}

export function PaymentTypeDialog({
  isOpen,
  timerName,
  timerId,
  durationMinutes,
  isExtension = false,
  onSelect,
  onCancel,
}: PaymentTypeDialogProps) {
  const pricePerHour = TIMER_PRICING[timerId] || 100;
  const hours = Math.ceil(durationMinutes / 60);
  const price = hours * pricePerHour;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl">
            {isExtension ? 'Extend Session' : 'Start Session'}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{timerName}</span>
              </p>
              <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duration:
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {hours} hour{hours > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rate:</span>
                  <span className="font-mono text-foreground">{pricePerHour} ₱/hour</span>
                </div>
                <div className="border-t border-border pt-2 mt-2">
                  <div className="flex justify-between text-xl font-bold">
                    <span className="text-primary">Amount:</span>
                    <span className="text-primary">{price} ₱</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Select payment type:</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-auto py-6 border-success/50 hover:bg-success/10 hover:border-success"
            onClick={() => onSelect('prepaid')}
          >
            <Banknote className="w-8 h-8 text-success" />
            <span className="font-semibold">Prepaid</span>
            <span className="text-xs text-muted-foreground">Pay now</span>
          </Button>
          
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-auto py-6 border-warning/50 hover:bg-warning/10 hover:border-warning"
            onClick={() => onSelect('postpaid')}
          >
            <CreditCard className="w-8 h-8 text-warning" />
            <span className="font-semibold">Postpaid</span>
            <span className="text-xs text-muted-foreground">Pay at end</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
