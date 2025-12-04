import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Trash2, Power } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CloseoutDialogProps {
  isOpen: boolean;
  timerName: string;
  onComplete: () => void;
  onCancel: () => void;
  playConfirmSound: () => void;
}

type CloseoutStage = 'cleanup' | 'equipment';

export function CloseoutDialog({ 
  isOpen, 
  timerName, 
  onComplete, 
  onCancel,
  playConfirmSound 
}: CloseoutDialogProps) {
  const [stage, setStage] = useState<CloseoutStage>('cleanup');

  const handleConfirm = () => {
    playConfirmSound();
    
    if (stage === 'cleanup') {
      setStage('equipment');
    } else if (stage === 'equipment') {
      onComplete();
      // Reset stage for next time
      setTimeout(() => setStage('cleanup'), 300);
    }
  };

  const handleCancel = () => {
    setStage('cleanup');
    onCancel();
  };

  const getStageContent = () => {
    if (stage === 'cleanup') {
      return {
        icon: <Trash2 className="w-12 h-12 text-warning" />,
        title: 'Clean the Area',
        description: `Session at ${timerName} has ended. Have you cleaned and tidied the gaming area?`,
        buttonText: 'Yes, Area is Clean',
        buttonClass: 'bg-warning hover:bg-warning/90 text-warning-foreground',
        bgClass: 'bg-warning/20',
      };
    } else {
      return {
        icon: <Power className="w-12 h-12 text-destructive" />,
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
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="flex flex-col items-center text-center gap-4">
          <div className={cn("p-4 rounded-full", content.bgClass)}>
            {content.icon}
          </div>
          <DialogTitle className="text-2xl">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-base">
            {content.description}
          </DialogDescription>
          
          {/* Progress indicator */}
          <div className="flex gap-2 mt-2">
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              stage === 'cleanup' ? "bg-warning" : "bg-success"
            )} />
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              stage === 'equipment' ? "bg-destructive" : "bg-muted"
            )} />
          </div>
        </DialogHeader>
        
        <div className="flex flex-col gap-2 mt-4">
          <Button 
            onClick={handleConfirm}
            className={cn("w-full text-lg py-6", content.buttonClass)}
            size="lg"
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            {content.buttonText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
