import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Timer, Gamepad2, Maximize, Minimize, Wallet, Activity, Package, Clock, Shield, ShieldOff, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useAdminMode } from '@/hooks/useAdminMode';
import { GlobalPauseButton } from './GlobalPauseButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NavigationProps {
  compact?: boolean;
  isPaused?: boolean;
  activeTimersCount?: number;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
}

export function Navigation({ compact, isPaused = false, activeTimersCount = 0, onPauseAll, onResumeAll }: NavigationProps) {
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { isAdmin, login, logout } = useAdminMode();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const handleLogin = () => {
    if (login(pinInput)) {
      setShowPinDialog(false);
      setPinInput('');
      toast.success('Admin mode enabled');
    } else {
      toast.error('Invalid PIN');
      setPinInput('');
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Admin mode disabled');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all',
      isActive
        ? 'text-primary bg-primary/10 md:rounded-lg md:border md:border-primary/20'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary md:rounded-lg'
    );

  if (compact) {
    return (
      <>
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

        <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Admin PIN
              </DialogTitle>
            </DialogHeader>
            <Input 
              type="password" 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleLogin()} 
              placeholder="Enter PIN" 
              autoFocus 
            />
            <Button onClick={handleLogin} className="w-full">Login</Button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
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
          {/* Employee sections - always visible */}
          <NavLink to="/" className={navLinkClass}>
            <Timer className="w-5 h-5" />
            <span>Timers</span>
          </NavLink>

          <NavLink to="/shift" className={navLinkClass}>
            <Clock className="w-5 h-5" />
            <span>Shift</span>
          </NavLink>

          {/* Admin sections - only visible when admin mode is active */}
          {isAdmin && (
            <>
              <NavLink to="/finance" className={navLinkClass}>
                <Wallet className="w-5 h-5" />
                <span>Finance</span>
              </NavLink>

              <NavLink to="/inventory" className={navLinkClass}>
                <Package className="w-5 h-5" />
                <span>Stock</span>
              </NavLink>

              <NavLink to="/activity" className={navLinkClass}>
                <Activity className="w-5 h-5" />
                <span>Activity</span>
              </NavLink>
            </>
          )}

          {/* Admin Toggle Button */}
          <button
            onClick={() => isAdmin ? handleLogout() : setShowPinDialog(true)}
            className={cn(
              'flex-1 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 py-3 md:py-0 px-2 md:px-3 md:h-10 text-xs md:text-sm font-medium transition-all md:rounded-lg',
              isAdmin
                ? 'text-green-500 bg-green-500/10 md:border md:border-green-500/20 hover:bg-green-500/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            {isAdmin ? (
              <>
                <ShieldOff className="w-5 h-5" />
                <span className="hidden md:inline">Exit Admin</span>
                <span className="md:hidden">Admin</span>
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                <span>Admin</span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              Admin PIN
            </DialogTitle>
          </DialogHeader>
          <Input 
            type="password" 
            value={pinInput} 
            onChange={e => setPinInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleLogin()} 
            placeholder="Enter PIN" 
            autoFocus 
          />
          <Button onClick={handleLogin} className="w-full">Login</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
