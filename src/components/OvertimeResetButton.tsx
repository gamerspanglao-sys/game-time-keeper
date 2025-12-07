import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getDailyPeriodKey } from '@/lib/timerUtils';
import { toast } from 'sonner';

const ADMIN_PASSWORD = '8808';

interface OvertimeResetButtonProps {
  totalOvertimeMinutes: number;
  compact?: boolean;
  onReset: () => void;
}

export function OvertimeResetButton({ totalOvertimeMinutes, compact, onReset }: OvertimeResetButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  if (totalOvertimeMinutes <= 0) return null;

  const handlePasswordSubmit = async () => {
    if (password === ADMIN_PASSWORD) {
      try {
        const periodKey = getDailyPeriodKey();
        
        const { data: existing } = await supabase
          .from('daily_stats')
          .select('*')
          .eq('period_key', periodKey)
          .maybeSingle();

        if (existing) {
          const timerStats = existing.timer_stats as Record<string, any> || {};
          delete timerStats.overtime;
          
          await supabase
            .from('daily_stats')
            .update({ 
              timer_stats: timerStats,
              updated_at: new Date().toISOString()
            })
            .eq('period_key', periodKey);
        }

        toast.success('Overtime reset successfully');
        onReset();
        setShowDialog(false);
        setPassword('');
        setPasswordError(false);
      } catch (err) {
        console.error('Error resetting overtime:', err);
        toast.error('Failed to reset overtime');
      }
    } else {
      setPasswordError(true);
    }
  };

  const formatOvertimeDisplay = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  return (
    <>
      <Button
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => setShowDialog(true)}
        className="border-destructive/30 text-destructive hover:bg-destructive/10"
      >
        <AlertTriangle className="w-4 h-4 mr-2" />
        Overtime: {formatOvertimeDisplay(totalOvertimeMinutes)}
        <RotateCcw className="w-3 h-3 ml-2" />
      </Button>

      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) {
          setShowDialog(false);
          setPassword('');
          setPasswordError(false);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset All Overtime</DialogTitle>
            <DialogDescription>
              This will clear all overtime records for today ({formatOvertimeDisplay(totalOvertimeMinutes)} total).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              className={cn(passwordError && "border-destructive")}
            />
            {passwordError && (
              <p className="text-sm text-destructive">Wrong password</p>
            )}
            <Button onClick={handlePasswordSubmit} variant="destructive" className="w-full">
              Reset Overtime
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
