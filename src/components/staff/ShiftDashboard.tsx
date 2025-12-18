import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sun, Moon, Clock, Users, Calendar, TrendingUp, Lock, Pencil, RotateCcw, Trash2, Banknote, AlertTriangle, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval } from 'date-fns';
import { toast } from 'sonner';

interface DailyShiftDetail {
  date: string;
  type: string;
  hours: number;
  shortage: number;
  bonus: number;
}

interface EmployeeStats {
  id: string;
  name: string;
  total_shifts: number;
  day_shifts: number;
  night_shifts: number;
  total_hours: number;
  avg_hours_per_shift: number;
  bonuses: number;
  shortages: number;
  dailyDetails: DailyShiftDetail[];
}

interface ShiftRecord {
  id: string;
  date: string;
  type: string;
  total_hours: number | null;
  shift_start: string | null;
  shift_end: string | null;
  cash_shortage: number | null;
}

const ADMIN_PIN = '8808';
const SALARY_PER_SHIFT = 500;

export function ShiftDashboard() {
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  
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
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'lastweek':
        const lastWeek = subWeeks(now, 1);
        return { start: startOfWeek(lastWeek, { weekStartsOn: 1 }), end: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
      case 'current':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'previous':
        const prevMonth = subMonths(now, 1);
        return { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) };
      case 'all':
        return { start: new Date('2020-01-01'), end: now };
      default:
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
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
      .select('employee_id, type, total_hours, status, date, cash_shortage')
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    const { data: bonuses } = await supabase
      .from('bonuses')
      .select('employee_id, amount, date')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));

    if (employees && shifts) {
      const employeeStats: EmployeeStats[] = employees.map(emp => {
        const empShifts = shifts.filter(s => s.employee_id === emp.id);
        const empBonuses = bonuses?.filter(b => b.employee_id === emp.id) || [];
        const dayShifts = empShifts.filter(s => s.type === 'day').length;
        const nightShifts = empShifts.filter(s => s.type === 'night').length;
        const totalHours = empShifts.reduce((sum, s) => sum + (Number(s.total_hours) || 0), 0);
        const totalShifts = dayShifts + nightShifts;
        const totalBonuses = empBonuses.reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalShortages = empShifts.reduce((sum, s) => sum + (Number(s.cash_shortage) || 0), 0);

        // Build daily details
        const dailyDetails: DailyShiftDetail[] = empShifts.map(shift => {
          const dayBonuses = empBonuses
            .filter(b => b.date === shift.date)
            .reduce((sum, b) => sum + (b.amount || 0), 0);
          
          return {
            date: shift.date,
            type: shift.type || 'day',
            hours: Number(shift.total_hours) || 0,
            shortage: Number(shift.cash_shortage) || 0,
            bonus: dayBonuses
          };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
          id: emp.id,
          name: emp.name,
          total_shifts: totalShifts,
          day_shifts: dayShifts,
          night_shifts: nightShifts,
          total_hours: Math.round(totalHours * 10) / 10,
          avg_hours_per_shift: totalShifts > 0 ? Math.round((totalHours / totalShifts) * 10) / 10 : 0,
          bonuses: totalBonuses,
          shortages: totalShortages,
          dailyDetails
        };
      }).filter(e => e.total_shifts > 0).sort((a, b) => b.total_shifts - a.total_shifts);

      setStats(employeeStats);
      
      // Set first employee as selected if none selected
      if (employeeStats.length > 0 && selectedEmployee === 'all') {
        // Keep 'all' as default
      }
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
      .select('id, date, type, total_hours, shift_start, shift_end, cash_shortage')
      .eq('employee_id', employeeId)
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))
      .order('date', { ascending: false });
    
    setEmployeeShifts((data || []) as ShiftRecord[]);
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
    
    // Get shift IDs to process bonuses
    const { data: shiftsToReset } = await supabase
      .from('shifts')
      .select('id')
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (shiftsToReset && shiftsToReset.length > 0) {
      const shiftIds = shiftsToReset.map(s => s.id);
      
      // Delete bonuses
      await supabase
        .from('bonuses')
        .delete()
        .in('shift_id', shiftIds);
    }
    
    // Archive shifts instead of deleting (keeps expense links)
    const { error } = await supabase
      .from('shifts')
      .update({ status: 'archived' })
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (error) {
      console.error('Reset error:', error);
      toast.error('Failed to reset: ' + error.message);
    } else {
      toast.success('All shifts archived');
      setShowResetAllDialog(false);
      loadStats();
    }
  };

  const totalShifts = stats.reduce((s, e) => s + e.total_shifts, 0);
  const totalHours = stats.reduce((s, e) => s + e.total_hours, 0);
  const totalDayShifts = stats.reduce((s, e) => s + e.day_shifts, 0);
  const totalNightShifts = stats.reduce((s, e) => s + e.night_shifts, 0);
  const totalBonuses = stats.reduce((s, e) => s + e.bonuses, 0);
  const totalShortages = stats.reduce((s, e) => s + e.shortages, 0);
  const totalBaseSalary = totalShifts * SALARY_PER_SHIFT;
  const totalSalary = totalBaseSalary + totalBonuses - totalShortages;
  const maxShifts = Math.max(...stats.map(e => e.total_shifts), 1);

  const periodLabel = period === 'week' ? 'This Week' : 
                      period === 'lastweek' ? 'Last Week' :
                      period === 'current' ? 'This Month' : 
                      period === 'previous' ? 'Last Month' : 'All Time';

  const selectedEmp = stats.find(e => e.id === selectedEmployee);

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Payroll Dashboard
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
              Reset
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
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="lastweek">Last Week</SelectItem>
              <SelectItem value="current">This Month</SelectItem>
              <SelectItem value="previous">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-2 text-center">
            <Calendar className="w-3.5 h-3.5 mx-auto mb-0.5 text-primary" />
            <p className="text-base font-bold text-primary">{totalShifts}</p>
            <p className="text-[9px] text-muted-foreground">Shifts</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-2 text-center">
            <Clock className="w-3.5 h-3.5 mx-auto mb-0.5 text-green-500" />
            <p className="text-base font-bold text-green-500">{totalHours}h</p>
            <p className="text-[9px] text-muted-foreground">Hours</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-2 text-center">
            <Banknote className="w-3.5 h-3.5 mx-auto mb-0.5 text-emerald-500" />
            <p className="text-base font-bold text-emerald-500">₱{totalSalary.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">Net Pay</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-2 text-center">
            <AlertTriangle className="w-3.5 h-3.5 mx-auto mb-0.5 text-red-500" />
            <p className="text-base font-bold text-red-500">₱{totalShortages.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">Shortages</p>
          </CardContent>
        </Card>
      </div>

      {/* Employee Tabs */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
      ) : stats.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">No shift data for {periodLabel}</div>
      ) : (
        <Tabs value={selectedEmployee} onValueChange={setSelectedEmployee} className="w-full">
          <TabsList className="w-full h-auto flex-wrap gap-1 bg-muted/50 p-1">
            <TabsTrigger value="all" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              All
            </TabsTrigger>
            {stats.map(emp => (
              <TabsTrigger 
                key={emp.id} 
                value={emp.id}
                className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {emp.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* All Employees View */}
          <TabsContent value="all" className="mt-3 space-y-3">
            {stats.map((emp, idx) => {
              const baseSalary = emp.total_shifts * SALARY_PER_SHIFT;
              const netPay = baseSalary + emp.bonuses - emp.shortages;
              
              return (
                <Card key={emp.id} className="border-border/50 hover:border-primary/30 transition-all">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' :
                          idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' :
                          idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {idx + 1}
                        </div>
                        <div>
                          <span className="font-semibold">{emp.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{emp.total_shifts} shifts</span>
                            <span>•</span>
                            <span>{emp.total_hours}h</span>
                            {emp.shortages > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-red-500 flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  -₱{emp.shortages}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-500">₱{netPay.toLocaleString()}</p>
                          {(emp.bonuses > 0 || emp.shortages > 0) && (
                            <p className="text-[9px] text-muted-foreground">
                              Base: ₱{baseSalary}
                              {emp.bonuses > 0 && <span className="text-emerald-500"> +{emp.bonuses}</span>}
                              {emp.shortages > 0 && <span className="text-red-500"> -{emp.shortages}</span>}
                            </p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 w-7 p-0"
                          onClick={() => setSelectedEmployee(emp.id)}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* Individual Employee Views */}
          {stats.map(emp => {
            const baseSalary = emp.total_shifts * SALARY_PER_SHIFT;
            const netPay = baseSalary + emp.bonuses - emp.shortages;
            
            return (
              <TabsContent key={emp.id} value={emp.id} className="mt-3 space-y-3">
                {/* Employee Summary */}
                <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-lg">{emp.name}</h4>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-7 text-xs"
                              onClick={() => requestAdminAction('edit', emp.id)}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-7 text-xs text-red-500 border-red-500/30"
                              onClick={() => requestAdminAction('reset', emp.id)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Reset
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="bg-amber-500/10 rounded-lg p-2 text-center">
                        <Sun className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                        <p className="text-sm font-bold text-amber-500">{emp.day_shifts}</p>
                        <p className="text-[9px] text-muted-foreground">Day</p>
                      </div>
                      <div className="bg-indigo-500/10 rounded-lg p-2 text-center">
                        <Moon className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                        <p className="text-sm font-bold text-indigo-500">{emp.night_shifts}</p>
                        <p className="text-[9px] text-muted-foreground">Night</p>
                      </div>
                      <div className="bg-green-500/10 rounded-lg p-2 text-center">
                        <Clock className="w-4 h-4 mx-auto mb-1 text-green-500" />
                        <p className="text-sm font-bold text-green-500">{emp.total_hours}h</p>
                        <p className="text-[9px] text-muted-foreground">Hours</p>
                      </div>
                      <div className="bg-red-500/10 rounded-lg p-2 text-center">
                        <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-red-500" />
                        <p className="text-sm font-bold text-red-500">₱{emp.shortages}</p>
                        <p className="text-[9px] text-muted-foreground">Shortage</p>
                      </div>
                    </div>

                    {/* Earnings Calculation */}
                    <div className="bg-background/50 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Base Salary ({emp.total_shifts} × ₱{SALARY_PER_SHIFT})</span>
                        <span className="font-medium">₱{baseSalary.toLocaleString()}</span>
                      </div>
                      {emp.bonuses > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-500">+ Bonuses</span>
                          <span className="font-medium text-emerald-500">₱{emp.bonuses.toLocaleString()}</span>
                        </div>
                      )}
                      {emp.shortages > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-red-500">− Shortages</span>
                          <span className="font-medium text-red-500">₱{emp.shortages.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="border-t border-border pt-2 mt-2">
                        <div className="flex justify-between">
                          <span className="font-semibold">Net Pay</span>
                          <span className="text-xl font-bold text-emerald-500">₱{netPay.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Daily Breakdown */}
                <Card>
                  <CardContent className="p-4">
                    <h5 className="font-medium text-sm mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Daily Breakdown
                    </h5>
                    {emp.dailyDetails.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No shifts recorded</p>
                    ) : (
                      <div className="space-y-2">
                        {emp.dailyDetails.map((day, i) => (
                          <div 
                            key={i}
                            className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                day.type === 'day' ? 'bg-amber-500/20' : 'bg-indigo-500/20'
                              }`}>
                                {day.type === 'day' ? (
                                  <Sun className="w-4 h-4 text-amber-500" />
                                ) : (
                                  <Moon className="w-4 h-4 text-indigo-500" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {format(new Date(day.date), 'EEE, MMM d')}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {day.hours}h • {day.type === 'day' ? 'Day Shift' : 'Night Shift'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">₱{SALARY_PER_SHIFT}</p>
                              <div className="flex items-center gap-2 text-[10px]">
                                {day.bonus > 0 && (
                                  <span className="text-emerald-500">+₱{day.bonus}</span>
                                )}
                                {day.shortage > 0 && (
                                  <span className="text-red-500 flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    -₱{day.shortage}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      )}


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
