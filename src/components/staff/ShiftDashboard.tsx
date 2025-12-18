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
import { Sun, Moon, Clock, Users, Calendar, TrendingUp, Lock, Pencil, RotateCcw, Trash2, Banknote, AlertTriangle, ChevronRight, CheckCircle, Wallet } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval } from 'date-fns';
import { toast } from 'sonner';

interface DailyShiftDetail {
  date: string;
  type: string;
  hours: number;
  shortage: number;
  bonus: number;
  salaryPaid: boolean;
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
  salaryPaid: boolean;
  salaryPaidAmount: number | null;
  salaryPaidAt: string | null;
}

interface ShiftRecord {
  id: string;
  date: string;
  type: string;
  total_hours: number | null;
  shift_start: string | null;
  shift_end: string | null;
  cash_shortage: number | null;
  salary_paid: boolean | null;
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
  
  // Pay salary state
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [payingEmployee, setPayingEmployee] = useState<EmployeeStats | null>(null);

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
      .select('employee_id, type, total_hours, status, date, cash_shortage, salary_paid, salary_paid_amount, salary_paid_at')
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
            bonus: dayBonuses,
            salaryPaid: !!shift.salary_paid
          };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Check if all shifts are paid
        const allShiftsPaid = empShifts.length > 0 && empShifts.every(s => s.salary_paid);
        const paidShift = empShifts.find(s => s.salary_paid);

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
          dailyDetails,
          salaryPaid: allShiftsPaid,
          salaryPaidAmount: paidShift?.salary_paid_amount ?? null,
          salaryPaidAt: paidShift?.salary_paid_at ?? null
        };
      }).sort((a, b) => b.total_shifts - a.total_shifts);

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
      .select('id, date, type, total_hours, shift_start, shift_end, cash_shortage, salary_paid')
      .eq('employee_id', employeeId)
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))
      .order('date', { ascending: false });
    
    setEmployeeShifts((data || []) as ShiftRecord[]);
    
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

  const paySalary = async () => {
    if (!payingEmployee) return;
    
    const baseSalary = payingEmployee.total_shifts * SALARY_PER_SHIFT;
    const netPay = baseSalary + payingEmployee.bonuses - payingEmployee.shortages;
    const { start, end } = getPeriodDates();
    
    const { error } = await supabase
      .from('shifts')
      .update({ 
        salary_paid: true, 
        salary_paid_amount: netPay,
        salary_paid_at: new Date().toISOString()
      })
      .eq('employee_id', payingEmployee.id)
      .eq('status', 'closed')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'));
    
    if (error) {
      toast.error('Failed to record payment');
      console.error(error);
    } else {
      toast.success(`Salary paid: ₱${netPay.toLocaleString()} to ${payingEmployee.name}`);
      setShowPayDialog(false);
      setPayingEmployee(null);
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
          <TabsContent value="all" className="mt-4 space-y-4">
            <div className="grid gap-4">
              {stats.map((emp, idx) => {
                const baseSalary = emp.total_shifts * SALARY_PER_SHIFT;
                const netPay = baseSalary + emp.bonuses - emp.shortages;
                const progressPercent = Math.min((emp.total_shifts / maxShifts) * 100, 100);
                
                return (
                  <Card 
                    key={emp.id} 
                    className={`overflow-hidden transition-all duration-300 cursor-pointer group ${
                      emp.total_shifts === 0 
                        ? 'border-border/30 bg-muted/20 opacity-60 hover:opacity-80' 
                        : emp.salaryPaid 
                          ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/5 to-transparent hover:shadow-lg' 
                          : 'border-border/50 hover:border-primary/50 hover:shadow-lg'
                    }`}
                    onClick={() => setSelectedEmployee(emp.id)}
                  >
                    {/* Progress bar at top */}
                    <div className="h-1 bg-muted">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          emp.total_shifts === 0 ? 'bg-muted-foreground/20' :
                          idx === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-600' :
                          idx === 1 ? 'bg-gradient-to-r from-slate-400 to-slate-600' :
                          idx === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                          'bg-primary/50'
                        }`}
                        style={{ width: emp.total_shifts === 0 ? '100%' : `${progressPercent}%` }}
                      />
                    </div>
                    
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Left: Avatar & Info */}
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shrink-0 ${
                            emp.total_shifts === 0 ? 'bg-muted text-muted-foreground/50' :
                            idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30' :
                            idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-lg shadow-slate-500/20' :
                            idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`font-bold text-base truncate ${emp.total_shifts === 0 ? 'text-muted-foreground' : ''}`}>
                                {emp.name}
                              </h4>
                              {emp.total_shifts === 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
                                  No shifts
                                </Badge>
                              )}
                              {emp.salaryPaid && emp.total_shifts > 0 && (
                                <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] gap-0.5 px-1.5 py-0">
                                  <CheckCircle className="w-2.5 h-2.5" />
                                  Paid
                                </Badge>
                              )}
                            </div>
                            
                            {/* Stats row */}
                            {emp.total_shifts > 0 ? (
                              <div className="flex items-center gap-3 text-xs">
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10">
                                  <Sun className="w-3 h-3 text-amber-500" />
                                  <span className="font-medium text-amber-600">{emp.day_shifts}</span>
                                </div>
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10">
                                  <Moon className="w-3 h-3 text-indigo-500" />
                                  <span className="font-medium text-indigo-600">{emp.night_shifts}</span>
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span>{emp.total_hours}h</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground/70">
                                No shifts this period
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Right: Salary breakdown */}
                        <div className="text-right shrink-0">
                          {emp.total_shifts > 0 ? (
                            <>
                              <div className="text-2xl font-bold text-emerald-500 mb-1">
                                ₱{netPay.toLocaleString()}
                              </div>
                              <div className="space-y-0.5 text-[10px]">
                                <div className="text-muted-foreground">
                                  Base: ₱{baseSalary.toLocaleString()}
                                </div>
                                {emp.bonuses > 0 && (
                                  <div className="text-emerald-500 font-medium">
                                    +₱{emp.bonuses.toLocaleString()} bonus
                                  </div>
                                )}
                                {emp.shortages > 0 && (
                                  <div className="text-red-500 font-medium flex items-center justify-end gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    -₱{emp.shortages.toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-xl font-bold text-muted-foreground/50">
                              ₱0
                            </div>
                          )}
                        </div>
                        
                        {/* Arrow */}
                        <ChevronRight className={`w-5 h-5 transition-colors shrink-0 mt-3 ${
                          emp.total_shifts === 0 ? 'text-muted-foreground/30' : 'text-muted-foreground group-hover:text-primary'
                        }`} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Individual Employee Views */}
          {stats.map(emp => {
            const baseSalary = emp.total_shifts * SALARY_PER_SHIFT;
            const netPay = baseSalary + emp.bonuses - emp.shortages;
            const idx = stats.findIndex(e => e.id === emp.id);
            
            return (
              <TabsContent key={emp.id} value={emp.id} className="mt-4 space-y-4">
                {/* Employee Header Card */}
                <Card className={`overflow-hidden ${
                  emp.salaryPaid 
                    ? 'border-emerald-500/30' 
                    : 'border-primary/20'
                }`}>
                  {/* Gradient Header */}
                  <div className={`h-2 ${
                    idx === 0 ? 'bg-gradient-to-r from-amber-400 to-amber-600' :
                    idx === 1 ? 'bg-gradient-to-r from-slate-400 to-slate-600' :
                    idx === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                    'bg-gradient-to-r from-primary/50 to-primary'
                  }`} />
                  
                  <CardContent className="p-5">
                    {/* Name & Actions */}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold ${
                          idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30' :
                          idx === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-lg shadow-slate-500/20' :
                          idx === 2 ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-xl">{emp.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {emp.total_shifts} shifts • {emp.total_hours}h total
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 text-xs"
                              onClick={() => requestAdminAction('edit', emp.id)}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="h-8 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                              onClick={() => requestAdminAction('reset', emp.id)}
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Reset
                            </Button>
                            {!emp.salaryPaid && (
                              <Button 
                                size="sm" 
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => {
                                  setPayingEmployee(emp);
                                  setShowPayDialog(true);
                                }}
                              >
                                <Wallet className="w-3.5 h-3.5 mr-1" />
                                Pay Salary
                              </Button>
                            )}
                          </>
                        )}
                        {emp.salaryPaid && (
                          <Badge className="bg-emerald-500/20 text-emerald-500 gap-1 px-3 py-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Paid
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-4 gap-3 mb-5">
                      <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl p-3 text-center border border-amber-500/20">
                        <Sun className="w-5 h-5 mx-auto mb-1.5 text-amber-500" />
                        <p className="text-xl font-bold text-amber-500">{emp.day_shifts}</p>
                        <p className="text-xs text-amber-600/70">Day Shifts</p>
                      </div>
                      <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 rounded-xl p-3 text-center border border-indigo-500/20">
                        <Moon className="w-5 h-5 mx-auto mb-1.5 text-indigo-500" />
                        <p className="text-xl font-bold text-indigo-500">{emp.night_shifts}</p>
                        <p className="text-xs text-indigo-600/70">Night Shifts</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl p-3 text-center border border-green-500/20">
                        <Clock className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
                        <p className="text-xl font-bold text-green-500">{emp.total_hours}h</p>
                        <p className="text-xs text-green-600/70">Total Hours</p>
                      </div>
                      <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 rounded-xl p-3 text-center border border-red-500/20">
                        <AlertTriangle className="w-5 h-5 mx-auto mb-1.5 text-red-500" />
                        <p className="text-xl font-bold text-red-500">₱{emp.shortages.toLocaleString()}</p>
                        <p className="text-xs text-red-600/70">Shortages</p>
                      </div>
                    </div>

                    {/* Earnings Calculation - Beautiful Receipt Style */}
                    <div className="bg-gradient-to-br from-muted/50 to-muted/20 rounded-xl p-4 border border-border/50">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Banknote className="w-4 h-4" />
                        Salary Calculation
                      </h5>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center py-2 border-b border-dashed border-border/50">
                          <span className="text-sm text-muted-foreground">Base Salary</span>
                          <div className="text-right">
                            <span className="font-mono text-sm">{emp.total_shifts} × ₱{SALARY_PER_SHIFT}</span>
                            <span className="font-bold ml-3">₱{baseSalary.toLocaleString()}</span>
                          </div>
                        </div>
                        
                        {emp.bonuses > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-dashed border-border/50">
                            <span className="text-sm text-emerald-500 flex items-center gap-1">
                              <TrendingUp className="w-3.5 h-3.5" />
                              Bonuses
                            </span>
                            <span className="font-bold text-emerald-500">+₱{emp.bonuses.toLocaleString()}</span>
                          </div>
                        )}
                        
                        {emp.shortages > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-dashed border-border/50">
                            <span className="text-sm text-red-500 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Shortages
                            </span>
                            <span className="font-bold text-red-500">−₱{emp.shortages.toLocaleString()}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center pt-3 mt-2">
                          <span className="font-bold text-lg">Net Pay</span>
                          <div className="text-right">
                            <span className="text-3xl font-bold text-emerald-500">₱{netPay.toLocaleString()}</span>
                            {emp.salaryPaid && emp.salaryPaidAt && (
                              <p className="text-xs text-emerald-500 flex items-center gap-1 justify-end mt-1">
                                <CheckCircle className="w-3 h-3" />
                                Paid on {format(new Date(emp.salaryPaidAt), 'MMM d, HH:mm')}
                              </p>
                            )}
                          </div>
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
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium">₱{SALARY_PER_SHIFT}</p>
                                {day.salaryPaid && (
                                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                                )}
                              </div>
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

      {/* Pay Salary Dialog */}
      <AlertDialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-500">
              <Wallet className="w-5 h-5" />
              Pay Salary?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Confirm salary payment for{' '}
                <span className="font-bold text-foreground">{payingEmployee?.name}</span>
              </p>
              {payingEmployee && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Base ({payingEmployee.total_shifts} × ₱{SALARY_PER_SHIFT})</span>
                    <span>₱{(payingEmployee.total_shifts * SALARY_PER_SHIFT).toLocaleString()}</span>
                  </div>
                  {payingEmployee.bonuses > 0 && (
                    <div className="flex justify-between text-sm text-emerald-500">
                      <span>+ Bonuses</span>
                      <span>₱{payingEmployee.bonuses.toLocaleString()}</span>
                    </div>
                  )}
                  {payingEmployee.shortages > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>− Shortages</span>
                      <span>₱{payingEmployee.shortages.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-emerald-500">
                      ₱{((payingEmployee.total_shifts * SALARY_PER_SHIFT) + payingEmployee.bonuses - payingEmployee.shortages).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={paySalary}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Confirm Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
