import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Trash2, Power, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { calculatePrice, formatElapsedTime, TIMER_PRICING } from '@/lib/timerUtils';

interface CloseoutDialogProps {
  isOpen: boolean;
  timerName: string;
  timerId: string;
  elapsedTime: number;
  onComplete: () => void;
  onCancel: () => void;
  playConfirmSound: () => void;
}

type CloseoutStage = 'payment' | 'cleanup' | 'equipment';

export function CloseoutDialog({ 
  isOpen, 
  timerName,
  timerId,
  elapsedTime,
  onComplete, 
  onCancel,
  playConfirmSound 
}: CloseoutDialogProps) {
  const [stage, setStage] = useState<CloseoutStage>('payment');

  const price = calculatePrice(timerId, elapsedTime);
  const pricePerHour = TIMER_PRICING[timerId] || 100;

  const handleConfirm = () => {
    playConfirmSound();
    
    if (stage === 'payment') {
      setStage('cleanup');
    } else if (stage === 'cleanup') {
      setStage('equipment');
    } else if (stage === 'equipment') {
      onComplete();
      // Reset stage for next time
      setTimeout(() => setStage('payment'), 300);
    }
  };

  const handleCancel = () => {
    setStage('payment');
    onCancel();
  };

  const getStageContent = () => {
    if (stage === 'payment') {
      return {
        icon: <Banknote className="w-16 h-16 text-primary" />,
        title: 'Collect Payment',
        description: (
          <div className="space-y-3">
            <p className="text-muted-foreground">Session at <span className="font-semibold text-foreground">{timerName}</span></p>
            <div className="bg-secondary/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-lg">
                <span className="text-muted-foreground">Time played:</span>
                <span className="font-mono font-bold text-foreground">{formatElapsedTime(elapsedTime)}</span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="text-muted-foreground">Rate:</span>
                <span className="font-mono text-foreground">{pricePerHour} ₱/hour</span>
              </div>
              <div className="border-t border-border pt-2 mt-2">
                <div className="flex justify-between text-2xl font-bold">
                  <span className="text-primary">TOTAL:</span>
                  <span className="text-primary">{price} ₱</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Have you collected this payment from the customer?</p>
          </div>
        ),
        buttonText: 'Yes, Payment Collected',
        buttonClass: 'bg-primary hover:bg-primary/90 text-primary-foreground',
        bgClass: 'bg-primary/20',
      };
    } else if (stage === 'cleanup') {
      return {
        icon: <Trash2 className="w-16 h-16 text-warning" />,
        title: 'Clean the Area',
        description: 'Have you cleaned and tidied the gaming area?',
        buttonText: 'Yes, Area is Clean',
        buttonClass: 'bg-warning hover:bg-warning/90 text-warning-foreground',
        bgClass: 'bg-warning/20',
      };
    } else {
      return {
        icon: <Power className="w-16 h-16 text-destructive" />,
        title: 'Turn Off Equipment',
        description: 'Have you turned off all electrical equipment (monitors, consoles, lights)?',
        buttonText: 'Yes, Equipment is Off',
        buttonClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
        bgClass: 'bg-destructive/20',
      };
    }
  };

  const content = getStageContent();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent 
        className="max-w-2xl min-h-[500px] flex flex-col" 
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex flex-col items-center text-center gap-6 flex-1 justify-center">
          <div className={cn("p-6 rounded-full", content.bgClass)}>
            {content.icon}
          </div>
          <DialogTitle className="text-3xl">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-lg" asChild>
            {typeof content.description === 'string' ? (
              <p>{content.description}</p>
            ) : (
              <div>{content.description}</div>
            )}
          </DialogDescription>
          
          {/* Progress indicator */}
          <div className="flex gap-3 mt-4">
            <div className={cn(
              "w-4 h-4 rounded-full transition-colors",
              stage === 'payment' ? "bg-primary" : "bg-success"
            )} />
            <div className={cn(
              "w-4 h-4 rounded-full transition-colors",
              stage === 'cleanup' ? "bg-warning" : stage === 'equipment' ? "bg-success" : "bg-muted"
            )} />
            <div className={cn(
              "w-4 h-4 rounded-full transition-colors",
              stage === 'equipment' ? "bg-destructive" : "bg-muted"
            )} />
          </div>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 mt-6">
          <Button 
            onClick={handleConfirm}
            className={cn("w-full text-xl py-8", content.buttonClass)}
            size="lg"
          >
            <CheckCircle2 className="w-6 h-6 mr-3" />
            {content.buttonText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
