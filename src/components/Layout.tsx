import { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { GlobalPauseButton } from './GlobalPauseButton';
import { Gamepad2 } from 'lucide-react';
import { useFullscreen } from '@/hooks/useFullscreen';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: ReactNode;
  compact?: boolean;
  isPaused?: boolean;
  activeTimersCount?: number;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
}

export function Layout({ 
  children, 
  compact,
  isPaused = false,
  activeTimersCount = 0,
  onPauseAll,
  onResumeAll,
}: LayoutProps) {
  const { isFullscreen } = useFullscreen();

  if (compact || isFullscreen) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation 
          compact 
          isPaused={isPaused}
          activeTimersCount={activeTimersCount}
          onPauseAll={onPauseAll}
          onResumeAll={onResumeAll}
        />
        <main className="p-3">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Navigation 
        isPaused={isPaused}
        activeTimersCount={activeTimersCount}
        onPauseAll={onPauseAll}
        onResumeAll={onResumeAll}
      />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between gap-3 px-4 py-4 border-b border-border bg-card/50 backdrop-blur-lg sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Gamepad2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Gamers</h1>
              <p className="text-xs text-muted-foreground">Timer System</p>
            </div>
          </div>
          {/* Mobile Pause Button */}
          {(activeTimersCount > 0 || isPaused) && onPauseAll && onResumeAll && (
            <GlobalPauseButton
              isPaused={isPaused}
              activeTimersCount={activeTimersCount}
              onPauseAll={onPauseAll}
              onResumeAll={onResumeAll}
            />
          )}
        </div>
        
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
