import { NavLink } from 'react-router-dom';
import { Timer, BarChart3, ScrollText, Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border md:relative md:border-t-0 md:border-r md:h-screen md:w-64 md:flex-shrink-0">
      {/* Logo - Desktop only */}
      <div className="hidden md:flex items-center gap-3 px-6 py-8 border-b border-border">
        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
          <Gamepad2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Gamers</h1>
          <p className="text-xs text-muted-foreground">Timer System</p>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex md:flex-col md:p-4 md:gap-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-4 md:h-12 text-xs md:text-sm font-medium transition-all',
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
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-4 md:h-12 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <BarChart3 className="w-5 h-5" />
          <span>Daily Stats</span>
        </NavLink>

        <NavLink
          to="/log"
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-4 md:h-12 text-xs md:text-sm font-medium transition-all',
              isActive
                ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
            )
          }
        >
          <ScrollText className="w-5 h-5" />
          <span>Activity Log</span>
        </NavLink>
      </div>
    </nav>
  );
}
