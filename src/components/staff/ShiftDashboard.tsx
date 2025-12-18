import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sun, Moon, Clock, Users, Calendar, TrendingUp, Lock, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { toast } from 'sonner';

interface EmployeeStats {
  id: string;
  name: string;
  total_shifts: number;
  day_shifts: number;
  night_shifts: number;
  total_hours: number;
  avg_hours_per_shift: number;
}

interface ShiftRecord {
  id: string;
  date: string;
  type: string;
  total_hours: number | null;
  shift_start: string | null;
  shift_end: string | null;
}

const ADMIN_PIN = '8808';

export function ShiftDashboard() {
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [period, setPeriod] = useState('current');
  const [loading, setLoading] = useState(true);
  
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'edit' | 'reset'; employeeId?: string } | null>(null);
  
  // Edit state
  const [editingEmployee, setEditingEmployee] = useState<EmployeeStats | null>(null);
  const [employeeShifts, setEmployeeShifts] = useState<ShiftRecord[]>([]);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRecord | null>(null);
  const [editHours, setEditHours] = useState('');
  
  // Reset state
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetEmployeeId, setResetEmployeeId] = useState<string | null>(null);
  const [showResetAllDialog, setShowResetAllDialog] = useState(false);

  const getPeriodDates = () => {
    const now = new Date();
    switch (period) {
      case 'current':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'previous':
        const prevMonth = subMonths(now, 1);
        return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
      case 'all':
        return { start: new Date('2020-01-01'), end: now };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const loadStats = async () => {
    setLoading(true);
    const { start, end } = getPeriodDates();
    
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name')
      .eq('active', true);

    const { data: shifts } = await supabase
      .from('shifts')
      .select('employee_id, type, total_hours, status')
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (employees && shifts) {
      const employeeStats: EmployeeStats[] = employees.map(emp => {
        const empShifts = shifts.filter(s => s.employee_id === emp.id);
        const dayShifts = empShifts.filter(s => s.type === 'day').length;
        const nightShifts = empShifts.filter(s => s.type === 'night').length;
        const totalHours = empShifts.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
        const totalShifts = dayShifts + nightShifts;

        return {
          id: emp.id,
          name: emp.name,
          total_shifts: totalShifts,
          day_shifts: dayShifts,
          night_shifts: nightShifts,
          total_hours: Math.round(totalHours * 10) / 10,
          avg_hours_per_shift: totalShifts > 0 ? Math.round((totalHours / totalShifts) * 10) / 10 : 0
        };
      }).filter(e => e.total_shifts > 0).sort((a, b) => b.total_shifts - a.total_shifts);

      setStats(employeeStats);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
  }, [period]);

  const verifyPin = () => {
    if (pin === ADMIN_PIN) {
      setIsAdmin(true);
      setShowPinDialog(false);
      setPin('');
      
      if (pendingAction?.type === 'edit' && pendingAction.employeeId) {
        openEditDialog(pendingAction.employeeId);
      } else if (pendingAction?.type === 'reset' && pendingAction.employeeId) {
        setResetEmployeeId(pendingAction.employeeId);
        setShowResetDialog(true);
      }
      setPendingAction(null);
    } else {
      toast.error('Incorrect PIN');
      setPin('');
    }
  };

  const requestAdminAction = (type: 'edit' | 'reset', employeeId: string) => {
    if (isAdmin) {
      if (type === 'edit') {
        openEditDialog(employeeId);
      } else {
        setResetEmployeeId(employeeId);
        setShowResetDialog(true);
      }
    } else {
      setPendingAction({ type, employeeId });
      setShowPinDialog(true);
    }
  };

  const openEditDialog = async (employeeId: string) => {
    const emp = stats.find(e => e.id === employeeId);
    if (!emp) return;
    
    setEditingEmployee(emp);
    const { start, end } = getPeriodDates();
    
    const { data } = await supabase
      .from('shifts')
      .select('id, date, type, total_hours, shift_start, shift_end')
      .eq('employee_id', employeeId)
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))
      .order('date', { ascending: false });
    
    setEmployeeShifts(data || []);
    setShowEditDialog(true);
  };

  const updateShiftHours = async () => {
    if (!editingShift) return;
    
    const hours = parseFloat(editHours);
    if (isNaN(hours) || hours < 0) {
      toast.error('Invalid hours');
      return;
    }
    
    const { error } = await supabase
      .from('shifts')
      .update({ total_hours: hours })
      .eq('id', editingShift.id);
    
    if (error) {
      toast.error('Failed to update');
    } else {
      toast.success('Hours updated');
      setEditingShift(null);
      setEditHours('');
      openEditDialog(editingEmployee!.id);
      loadStats();
    }
  };

  const deleteShift = async (shiftId: string) => {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId);
    
    if (error) {
      toast.error('Failed to delete');
    } else {
      toast.success('Shift deleted');
      openEditDialog(editingEmployee!.id);
      loadStats();
    }
  };

  const resetEmployeeShifts = async () => {
    if (!resetEmployeeId) return;
    
    const { start, end } = getPeriodDates();
    
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('employee_id', resetEmployeeId)
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (error) {
      toast.error('Failed to reset');
    } else {
      toast.success('Shifts reset');
      setShowResetDialog(false);
      setResetEmployeeId(null);
      loadStats();
    }
  };

  const resetAllShifts = async () => {
    const { start, end } = getPeriodDates();
    
    // Get shift IDs to process
    const { data: shiftsToDelete } = await supabase
      .from('shifts')
      .select('id')
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (shiftsToDelete && shiftsToDelete.length > 0) {
      const shiftIds = shiftsToDelete.map(s => s.id);
      
      // Unlink expenses from shifts (keep expenses, just remove shift_id)
      await supabase
        .from('cash_expenses')
        .update({ shift_id: null })
        .in('shift_id', shiftIds);
      
      // Delete bonuses
      await supabase
        .from('bonuses')
        .delete()
        .in('shift_id', shiftIds);
    }
    
    // Delete the shifts
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (error) {
      console.error('Reset error:', error);
      toast.error('Failed to reset: ' + error.message);
    } else {
      toast.success('All shifts reset');
      setShowResetAllDialog(false);
      loadStats();
    }
  };

  const totalShifts = stats.reduce((s, e) => s + e.total_shifts, 0);
  const totalHours = stats.reduce((s, e) => s + e.total_hours, 0);
  const totalDayShifts = stats.reduce((s, e) => s + e.day_shifts, 0);
  const totalNightShifts = stats.reduce((s, e) => s + e.night_shifts, 0);
  const maxShifts = Math.max(...stats.map(e => e.total_shifts), 1);

  const periodLabel = period === 'current' ? 'This Month' : period === 'previous' ? 'Last Month' : 'All Time';

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Employee Shifts
          {isAdmin && <Badge className="bg-red-500/20 text-red-500 text-[10px]">Admin</Badge>}
        </h3>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button 
              size="sm" 
              variant="outline"
              className="h-8 px-2 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={() => setShowResetAllDialog(true)}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset All
            </Button>
          )}
          {!isAdmin && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setShowPinDialog(true)}
            >
              <Lock className="w-3.5 h-3.5" />
            </Button>
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">This Month</SelectItem>
              <SelectItem value="previous">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-center">
            <Calendar className="w-4 h-4 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold text-primary">{totalShifts}</p>
            <p className="text-[10px] text-muted-foreground">Total Shifts</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-3 text-center">
            <Sun className="w-4 h-4 mx-auto mb-1 text-amber-500" />
            <p className="text-lg font-bold text-amber-500">{totalDayShifts}</p>
            <p className="text-[10px] text-muted-foreground">Day Shifts</p>
          </CardContent>
        </Card>
        <Card className="border-indigo-500/20 bg-indigo-500/5">
          <CardContent className="p-3 text-center">
            <Moon className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
            <p className="text-lg font-bold text-indigo-500">{totalNightShifts}</p>
            <p className="text-[10px] text-muted-foreground">Night Shifts</p>
          </CardContent>
        </Card>
      </div>

      {/* Total Hours */}
      <Card className="border-green-500/20 bg-gradient-to-r from-green-500/10 to-transparent">
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium">Total Hours ({periodLabel})</span>
          </div>
          <span className="text-xl font-bold text-green-500">{totalHours.toLocaleString()}h</span>
        </CardContent>
      </Card>

      {/* Employee List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : stats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No shift data for this period</div>
        ) : (
          stats.map((emp, idx) => (
            <Card key={emp.id} className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-amber-500/20 text-amber-500' :
                      idx === 1 ? 'bg-slate-400/20 text-slate-400' :
                      idx === 2 ? 'bg-orange-600/20 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {idx + 1}
                    </div>
                    <span className="font-medium text-sm">{emp.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-500/10"
                          onClick={() => requestAdminAction('edit', emp.id)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10"
                          onClick={() => requestAdminAction('reset', emp.id)}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {emp.total_shifts} shifts
                    </Badge>
                  </div>
                </div>

                <Progress 
                  value={(emp.total_shifts / maxShifts) * 100} 
                  className="h-2 mb-2"
                />

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Sun className="w-3 h-3 text-amber-500" />
                      {emp.day_shifts}
                    </span>
                    <span className="flex items-center gap-1">
                      <Moon className="w-3 h-3 text-indigo-500" />
                      {emp.night_shifts}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {emp.total_hours}h
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      ~{emp.avg_hours_per_shift}h/shift
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Admin Access
            </DialogTitle>
            <DialogDescription>Enter PIN to access admin features</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN"
              className="text-center text-lg tracking-widest"
              onKeyDown={e => e.key === 'Enter' && verifyPin()}
            />
            <Button onClick={verifyPin} className="w-full">Unlock</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit Shifts - {editingEmployee?.name}
            </DialogTitle>
            <DialogDescription>
              {periodLabel} • {employeeShifts.length} shifts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {employeeShifts.map(shift => (
              <div key={shift.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2">
                  {shift.type === 'day' ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-500" />
                  )}
                  <div>
                    <span className="text-sm font-medium">{shift.date}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {shift.total_hours ? `${shift.total_hours}h` : 'No hours'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingShift(shift);
                      setEditHours(shift.total_hours?.toString() || '');
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 w-7 p-0 text-red-500"
                    onClick={() => deleteShift(shift.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          {editingShift && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-2">
              <div className="text-xs font-medium text-blue-600">Edit Hours for {editingShift.date}</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={editHours}
                  onChange={e => setEditHours(e.target.value)}
                  placeholder="Hours"
                  className="flex-1"
                />
                <Button size="sm" onClick={updateShiftHours}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingShift(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <RotateCcw className="w-5 h-5" />
              Reset All Shifts?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all closed shifts for{' '}
              <span className="font-bold text-foreground">
                {stats.find(e => e.id === resetEmployeeId)?.name}
              </span>{' '}
              in {periodLabel}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={resetEmployeeShifts}
              className="bg-red-500 hover:bg-red-600"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset All Confirmation Dialog */}
      <AlertDialog open={showResetAllDialog} onOpenChange={setShowResetAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <RotateCcw className="w-5 h-5" />
              Reset ALL Shifts?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete <span className="font-bold text-foreground">{totalShifts} shifts</span> for all employees in <span className="font-bold text-foreground">{periodLabel}</span>. 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={resetAllShifts}
              className="bg-red-500 hover:bg-red-600"
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
