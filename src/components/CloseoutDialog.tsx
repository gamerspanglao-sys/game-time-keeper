import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Trash2, Power } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CloseoutDialogProps {
  isOpen: boolean;
  timerName: string;
  onComplete: () => void;
  onCancel: () => void;
  playConfirmSound: () => void;
}

type CloseoutStage = 'cleanup' | 'equipment' | 'done';

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
      setStage('done');
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
    switch (stage) {
      case 'cleanup':
        return {
          icon: <Trash2 className="w-12 h-12 text-warning" />,
          title: 'Clean the Area',
          description: `Session at ${timerName} has ended. Have you cleaned and tidied the gaming area?`,
          buttonText: 'Yes, Area is Clean',
          buttonClass: 'bg-warning hover:bg-warning/90 text-warning-foreground',
        };
      case 'equipment':
        return {
          icon: <Power className="w-12 h-12 text-destructive" />,
          title: 'Turn Off Equipment',
          description: 'Have you turned off all electrical equipment (monitors, consoles, lights)?',
          buttonText: 'Yes, Equipment is Off',
          buttonClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
        };
      default:
        return {
          icon: <CheckCircle2 className="w-12 h-12 text-success" />,
          title: 'Complete',
          description: 'All tasks completed!',
          buttonText: 'Done',
          buttonClass: 'bg-success hover:bg-success/90 text-success-foreground',
        };
    }
  };

  const content = getStageContent();

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="flex flex-col items-center text-center gap-4">
          <div className={cn(
            "p-4 rounded-full",
            stage === 'cleanup' && "bg-warning/20",
            stage === 'equipment' && "bg-destructive/20",
            stage === 'done' && "bg-success/20"
          )}>
            {content.icon}
          </div>
          <AlertDialogTitle className="text-2xl">
            {content.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {content.description}
          </AlertDialogDescription>
          
          {/* Progress indicator */}
          <div className="flex gap-2 mt-2">
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              stage === 'cleanup' ? "bg-warning" : "bg-success"
            )} />
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              stage === 'equipment' ? "bg-destructive" : stage === 'done' ? "bg-success" : "bg-muted"
            )} />
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction 
            onClick={handleConfirm}
            className={cn("w-full text-lg py-6", content.buttonClass)}
          >
            <CheckCircle2 className="w-5 h-5 mr-2" />
            {content.buttonText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
