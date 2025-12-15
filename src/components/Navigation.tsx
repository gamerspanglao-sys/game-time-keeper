import { NavLink } from 'react-router-dom';
import { Timer, BarChart3, Gamepad2, Maximize, Minimize, Wallet, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/hooks/useFullscreen';
import { GlobalPauseButton } from './GlobalPauseButton';

interface NavigationProps {
  compact?: boolean;
  isPaused?: boolean;
  activeTimersCount?: number;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
}

export function Navigation({ compact, isPaused = false, activeTimersCount = 0, onPauseAll, onResumeAll }: NavigationProps) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();

  if (compact) {
    return (
      <nav className="fixed top-4 right-4 z-50 flex gap-2">
        {(activeTimersCount > 0 || isPaused) && onPauseAll && onResumeAll && (
          <GlobalPauseButton
            isPaused={isPaused}
            activeTimersCount={activeTimersCount}
            onPauseAll={onPauseAll}
            onResumeAll={onResumeAll}
          />
        )}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-card/90 backdrop-blur border border-border hover:border-primary/30 transition-all"
        >
          {isFullscreen ? (
            <Minimize className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Maximize className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
      </nav>
    );
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border md:relative md:border-t-0 md:border-r md:h-screen md:w-56 md:flex-shrink-0">
      {/* Logo - Desktop only */}
      <div className="hidden md:flex items-center justify-between gap-3 px-4 py-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Gamepad2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Gamers</h1>
            <p className="text-xs text-muted-foreground">Timer System</p>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg hover:bg-secondary transition-all"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Maximize className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Global Pause Button - Desktop */}
      {(activeTimersCount > 0 || isPaused) && onPauseAll && onResumeAll && (
        <div className="hidden md:block px-3 py-3 border-b border-border">
          <GlobalPauseButton
            isPaused={isPaused}
            activeTimersCount={activeTimersCount}
            onPauseAll={onPauseAll}
            onResumeAll={onResumeAll}
          />
        </div>
      )}

      {/* Navigation Links */}
      <div className="flex md:flex-col md:p-3 md:gap-1">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <Timer className="w-5 h-5" />
          <span>Timers</span>
        </NavLink>

        <NavLink
          to="/stats"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <BarChart3 className="w-5 h-5" />
          <span>Stats</span>
        </NavLink>

        <NavLink
          to="/finance"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <Wallet className="w-5 h-5" />
          <span>Finance</span>
        </NavLink>

        <NavLink
          to="/purchases"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <ShoppingCart className="w-5 h-5" />
          <span>Purchases</span>
        </NavLink>
      </div>
    </nav>
  );
}
