import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlarmActivationBannerProps {
  timerNames: string[];
  onActivate: () => void;
  compact?: boolean;
}

export function AlarmActivationBanner({ timerNames, onActivate, compact }: AlarmActivationBannerProps) {
  if (timerNames.length === 0) return null;

  return (
    <button
      onClick={onActivate}
      className={cn(
        "w-full flex items-center justify-center gap-3 bg-destructive text-destructive-foreground rounded-lg animate-pulse cursor-pointer transition-all hover:bg-destructive/90",
        compact ? "py-3 px-4" : "py-4 px-6"
      )}
    >
      <Volume2 className={cn("animate-bounce", compact ? "w-5 h-5" : "w-6 h-6")} />
      <span className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
        {timerNames.length === 1 
          ? `${timerNames[0]} FINISHED - Tap to enable alarm`
          : `${timerNames.length} timers finished - Tap to enable alarm`
        }
      </span>
      <Volume2 className={cn("animate-bounce", compact ? "w-5 h-5" : "w-6 h-6")} />
    </button>
  );
}
