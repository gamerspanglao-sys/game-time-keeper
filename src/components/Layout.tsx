import { ReactNode } from 'react';
import { Navigation } from './Navigation';
import { Gamepad2 } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <Navigation />
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-3 px-4 py-4 border-b border-border bg-card/50 backdrop-blur-lg sticky top-0 z-40">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Gamepad2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Gamers</h1>
            <p className="text-xs text-muted-foreground">Timer System</p>
          </div>
        </div>
        
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
