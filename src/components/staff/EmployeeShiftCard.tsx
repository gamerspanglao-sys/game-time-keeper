import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Play, Square, Clock, Wallet, Gift, Plus, Loader2, Users, Pencil, Sun, Moon, Lock } from 'lucide-react';

const ADMIN_PIN = '8808';

interface Employee {
  id: string;
  name: string;
  position: string;
}

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  shift_start: string | null;
  shift_end: string | null;
  total_hours: number;
  base_salary: number;
  status: string;
  expected_cash: number;
  cash_handed_over: number | null;
}

interface ActiveShiftWithEmployee extends Shift {
  employee_name: string;
}

interface Bonus {
  id: string;
  bonus_type: string;
  quantity: number;
  amount: number;
  comment: string | null;
}

// Get current shift type based on Manila time
const getCurrentShiftType = (): 'day' | 'night' => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

export function EmployeeShiftCard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [allActiveShifts, setAllActiveShifts] = useState<ActiveShiftWithEmployee[]>([]);
  const [shiftBonuses, setShiftBonuses] = useState<Bonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  
  // Live timer for selected employee
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
  const currentShiftType = getCurrentShiftType();
  
  // Start shift dialog
  const [showStartDialog, setShowStartDialog] = useState(false);
  
  // End shift dialog
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [gcashInput, setGcashInput] = useState('');
  const [selectedShiftToEnd, setSelectedShiftToEnd] = useState<ActiveShiftWithEmployee | null>(null);
  
  // PIN dialog for admin
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Edit shift dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<ActiveShiftWithEmployee | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editHour, setEditHour] = useState('12');
  const [editMinute, setEditMinute] = useState('00');
  const [editAmPm, setEditAmPm] = useState<'AM' | 'PM'>('AM');
  const [editSalary, setEditSalary] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Bonus dialog
  const [showBonusDialog, setShowBonusDialog] = useState(false);
  const [bonusShift, setBonusShift] = useState<ActiveShiftWithEmployee | null>(null);
  const [bonusType, setBonusType] = useState<string>('sold_goods');
  const [bonusQuantity, setBonusQuantity] = useState('1');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusComment, setBonusComment] = useState('');

  useEffect(() => {
    loadEmployees();
    loadAllActiveShifts();
    
    // Subscribe to shifts changes
    const channel = supabase
      .channel('shifts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadAllActiveShifts();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      loadActiveShift();
    }
  }, [selectedEmployee]);

  // Live timer effect
  useEffect(() => {
    if (!activeShift?.shift_start) {
      setElapsedTime('00:00:00');
      return;
    }
    
    const updateTimer = () => {
      const start = new Date(activeShift.shift_start!).getTime();
      const now = Date.now();
      const diff = now - start;
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setElapsedTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [activeShift?.shift_start]);

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('active', true)
        .order('name');
      
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllActiveShifts = async () => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select(`
          *,
          employees (name)
        `)
        .eq('status', 'open')
        .order('shift_start', { ascending: false });
      
      if (error) throw error;
      
      setAllActiveShifts(
        (data || []).map((s: any) => ({
          ...s,
          employee_name: s.employees?.name || 'Unknown'
        }))
      );
    } catch (error) {
      console.error('Error loading active shifts:', error);
    }
  };

  const loadActiveShift = async () => {
    if (!selectedEmployee) return;
    
    try {
      const { data: shift, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('employee_id', selectedEmployee)
        .eq('status', 'open')
        .maybeSingle();
      
      if (error) throw error;
      setActiveShift(shift);
      
      if (shift) {
        const { data: bonuses } = await supabase
          .from('bonuses')
          .select('*')
          .eq('shift_id', shift.id);
        setShiftBonuses(bonuses || []);
      } else {
        setShiftBonuses([]);
      }
    } catch (error) {
      console.error('Error loading shift:', error);
    }
  };

  const startShift = async () => {
    if (!selectedEmployee) {
      toast.error('Select an employee first');
      return;
    }

    setStarting(true);
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('shifts')
        .insert({
          employee_id: selectedEmployee,
          date: format(new Date(), 'yyyy-MM-dd'),
          shift_start: now,
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;
      
      setActiveShift(data);
      toast.success('Shift started!');
      
      // Send Telegram notification
      const employee = employees.find(e => e.id === selectedEmployee);
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'shift_start',
          employeeName: employee?.name,
          time: format(new Date(), 'HH:mm')
        }
      });
    } catch (error) {
      console.error('Error starting shift:', error);
      toast.error('Failed to start shift');
    } finally {
      setStarting(false);
    }
  };

  const endShift = async () => {
    const shiftToEnd = selectedShiftToEnd || activeShift;
    if (!shiftToEnd) {
      toast.error('No shift selected');
      return;
    }
    
    const cashAmount = parseInt(cashInput) || 0;
    const gcashAmount = parseInt(gcashInput) || 0;
    const totalAmount = cashAmount + gcashAmount;
    
    if (totalAmount === 0) {
      toast.error('Enter Cash or GCash amount');
      return;
    }

    setEnding(true);
    try {
      const now = new Date();
      const startTime = new Date(shiftToEnd.shift_start!);
      const totalHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      
      // Determine the shift type based on when shift started (not current time)
      const manilaOffset = 8 * 60;
      const startUtcTime = startTime.getTime() + (startTime.getTimezoneOffset() * 60000);
      const startManilaTime = new Date(startUtcTime + (manilaOffset * 60000));
      const startHour = startManilaTime.getHours();
      const shiftType = startHour >= 5 && startHour < 17 ? 'day' : 'night';
      
      // For shift date, use the date when the shift started (for day shifts)
      // For night shifts that started after 5 PM, use the NEXT day's date for the cash register
      let shiftDate: string;
      if (shiftType === 'night' && startHour >= 17) {
        // Night shift that started after 5 PM belongs to next calendar day
        const nextDay = new Date(startManilaTime);
        nextDay.setDate(nextDay.getDate() + 1);
        shiftDate = format(nextDay, 'yyyy-MM-dd');
      } else {
        shiftDate = format(startManilaTime, 'yyyy-MM-dd');
      }
      
      console.log(`📊 End shift: startHour=${startHour}, shiftType=${shiftType}, shiftDate=${shiftDate}`);
      
      // Get expected cash from cash_register for this shift
      const { data: cashRecord } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', shiftDate)
        .eq('shift', shiftType)
        .maybeSingle();
      
      const expectedCash = cashRecord?.expected_sales || 0;
      const totalExpenses = (cashRecord?.purchases || 0) + (cashRecord?.salaries || 0) + (cashRecord?.other_expenses || 0);
      const calculatedExpected = (cashRecord?.opening_balance || 0) + expectedCash - totalExpenses;
      const discrepancy = totalAmount - calculatedExpected;

      // Get bonuses for this shift
      const { data: bonuses } = await supabase
        .from('bonuses')
        .select('amount')
        .eq('shift_id', shiftToEnd.id);
      
      const totalBonusAmount = bonuses?.reduce((sum, b) => sum + b.amount, 0) || 0;

      // Update shift with cash data (total = cash + gcash)
      const { error } = await supabase
        .from('shifts')
        .update({
          shift_end: now.toISOString(),
          total_hours: Math.round(totalHours * 100) / 100,
          cash_handed_over: totalAmount,
          gcash_handed_over: gcashAmount,
          cash_difference: discrepancy,
          expected_cash: calculatedExpected,
          status: 'closed'
        })
        .eq('id', shiftToEnd.id);

      if (error) throw error;

      // Update cash_register with actual cash and gcash
      if (cashRecord) {
        await supabase
          .from('cash_register')
          .update({
            actual_cash: totalAmount,
            cash_actual: cashAmount,
            gcash_actual: gcashAmount,
            discrepancy: discrepancy
          })
          .eq('id', cashRecord.id);
      } else {
        await supabase
          .from('cash_register')
          .insert({
            date: shiftDate,
            shift: shiftType,
            actual_cash: totalAmount,
            cash_actual: cashAmount,
            gcash_actual: gcashAmount,
            discrepancy: discrepancy
          });
      }

      // Sync sales data from Loyverse for accurate expected values
      console.log('📊 Auto-syncing sales data from Loyverse...');
      try {
        await supabase.functions.invoke('loyverse-history-sync', {
          body: { days: 3 }
        });
        console.log('✅ Loyverse sync completed');
      } catch (syncError) {
        console.error('⚠️ Loyverse sync failed:', syncError);
      }

      // Send Telegram notification
      const employeeName = 'employee_name' in shiftToEnd 
        ? (shiftToEnd as ActiveShiftWithEmployee).employee_name 
        : employees.find(e => e.id === shiftToEnd.employee_id)?.name;
        
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'shift_end',
          employeeName,
          totalHours: totalHours.toFixed(1),
          cashHandedOver: totalAmount,
          cashAmount: cashAmount,
          gcashAmount: gcashAmount,
          expectedCash: calculatedExpected,
          difference: discrepancy,
          bonuses: totalBonusAmount,
          baseSalary: shiftToEnd.base_salary
        }
      });

      // Show success with discrepancy info
      if (discrepancy !== 0) {
        toast.warning(`Shift ended! Discrepancy: ${discrepancy > 0 ? '+' : ''}₱${discrepancy.toLocaleString()}`);
      } else {
        toast.success('Shift ended! Total matches expected.');
      }
      
      setActiveShift(null);
      setSelectedShiftToEnd(null);
      setShiftBonuses([]);
      setCashInput('');
      setGcashInput('');
      setShowEndDialog(false);
      loadAllActiveShifts();
    } catch (error) {
      console.error('Error ending shift:', error);
      toast.error('Failed to end shift');
    } finally {
      setEnding(false);
    }
  };

  const requestAdminEdit = () => {
    setShowPinDialog(true);
    setPinInput('');
    setPinError('');
  };

  const handlePinSubmit = () => {
    if (pinInput === ADMIN_PIN) {
      setShowPinDialog(false);
      setShowEditDialog(true);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Wrong PIN');
    }
  };

  const addBonus = async () => {
    const targetShift = bonusShift || activeShift;
    if (!targetShift || !bonusAmount) {
      toast.error('Enter bonus amount');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bonuses')
        .insert({
          shift_id: targetShift.id,
          employee_id: targetShift.employee_id,
          date: format(new Date(), 'yyyy-MM-dd'),
          bonus_type: bonusType,
          quantity: parseInt(bonusQuantity) || 1,
          amount: parseInt(bonusAmount),
          comment: bonusComment || null
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Bonus added!');
      
      // Reset form
      setBonusAmount('');
      setBonusQuantity('1');
      setBonusComment('');
      setBonusShift(null);
      setShowBonusDialog(false);

      // Send Telegram notification
      const employeeName = 'employee_name' in targetShift 
        ? (targetShift as ActiveShiftWithEmployee).employee_name 
        : employees.find(e => e.id === targetShift.employee_id)?.name;
        
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'bonus_added',
          employeeName,
          bonusType: bonusType,
          amount: parseInt(bonusAmount)
        }
      });
    } catch (error) {
      console.error('Error adding bonus:', error);
      toast.error('Failed to add bonus');
    }
  };

  const getBonusTypeLabel = (type: string) => {
    switch (type) {
      case 'sold_goods': return 'Sold Goods';
      case 'vip_room': return 'VIP Room';
      case 'hookah': return 'Hookah';
      case 'other': return 'Other';
      default: return type;
    }
  };

  const openEditDialog = (shift: ActiveShiftWithEmployee) => {
    setEditingShift(shift);
    // Format start date and time for inputs
    if (shift.shift_start) {
      const startDate = new Date(shift.shift_start);
      setEditStartDate(format(startDate, 'yyyy-MM-dd'));
      // Convert to 12-hour format
      let hour = startDate.getHours();
      const minute = startDate.getMinutes();
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      setEditHour(hour.toString());
      setEditMinute(minute.toString().padStart(2, '0'));
      setEditAmPm(ampm);
    } else {
      // Default to shift date for date, 12:00 AM for time
      setEditStartDate(shift.date);
      setEditHour('12');
      setEditMinute('00');
      setEditAmPm('AM');
    }
    setEditSalary(shift.base_salary?.toString() || '500');
    setShowEditDialog(true);
  };

  const saveShiftEdit = async () => {
    if (!editingShift || !editStartDate) return;

    setSaving(true);
    try {
      // Convert 12-hour format to 24-hour
      let hours = parseInt(editHour);
      const minutes = parseInt(editMinute);
      if (editAmPm === 'PM' && hours !== 12) hours += 12;
      if (editAmPm === 'AM' && hours === 12) hours = 0;
      
      const shiftStart = new Date(editStartDate + 'T00:00:00');
      shiftStart.setHours(hours, minutes, 0, 0);
      
      // Calculate hours if shift is closed
      let totalHours = editingShift.total_hours;
      if (editingShift.status === 'closed' && editingShift.shift_end) {
        const endTime = new Date(editingShift.shift_end);
        totalHours = (endTime.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
        totalHours = Math.round(totalHours * 100) / 100;
      }

      const { error } = await supabase
        .from('shifts')
        .update({
          shift_start: shiftStart.toISOString(),
          total_hours: totalHours,
          base_salary: parseInt(editSalary) || 500
        })
        .eq('id', editingShift.id);

      if (error) throw error;

      toast.success('Shift updated');
      setShowEditDialog(false);
      setEditingShift(null);
      loadAllActiveShifts();
    } catch (error) {
      console.error('Error updating shift:', error);
      toast.error('Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  const totalBonuses = shiftBonuses.reduce((sum, b) => sum + b.amount, 0);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Open end shift dialog for specific employee
  const openEndShiftDialog = (shift: ActiveShiftWithEmployee) => {
    setSelectedShiftToEnd(shift);
    setSelectedEmployee(shift.employee_id);
    setCashInput('');
    setGcashInput('');
    setShowEndDialog(true);
  };

  // Open bonus dialog for specific employee
  const openBonusDialog = (shift: ActiveShiftWithEmployee) => {
    setBonusShift(shift);
    setSelectedEmployee(shift.employee_id);
    setBonusType('sold_goods');
    setBonusQuantity('1');
    setBonusAmount('');
    setBonusComment('');
    setShowBonusDialog(true);
  };

  return (
    <div className="space-y-4">
      {/* Header - Current shift type */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentShiftType === 'day' ? (
            <Sun className="w-5 h-5 text-amber-500" />
          ) : (
            <Moon className="w-5 h-5 text-indigo-500" />
          )}
          <span className="font-semibold">{currentShiftType === 'day' ? 'Day Shift' : 'Night Shift'}</span>
          <Badge variant="outline" className="text-xs">
            {currentShiftType === 'day' ? '5AM-5PM' : '5PM-5AM'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={requestAdminEdit}>
          <Lock className="w-4 h-4" />
        </Button>
      </div>

      {/* Active shifts - clickable cards */}
      {allActiveShifts.length > 0 && (
        <div className="space-y-2">
          {allActiveShifts.map((shift) => {
            // Calculate elapsed time for this shift
            const start = shift.shift_start ? new Date(shift.shift_start).getTime() : 0;
            const elapsed = start ? Date.now() - start : 0;
            const hours = Math.floor(elapsed / (1000 * 60 * 60));
            const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
            const timeStr = `${hours}h ${minutes}m`;
            
            return (
              <Card key={shift.id} className="border-green-500/30 bg-green-500/5">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <div className="font-semibold">{shift.employee_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {shift.shift_start ? format(new Date(shift.shift_start), 'HH:mm') : ''} • {timeStr}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openBonusDialog(shift)}
                      >
                        <Gift className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => openEndShiftDialog(shift)}
                      >
                        <Square className="w-4 h-4 mr-1" />
                        End
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {allActiveShifts.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            No one on shift
          </CardContent>
        </Card>
      )}

      {/* Big Start Shift Button */}
      <Button 
        size="lg"
        className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
        onClick={() => {
          setSelectedEmployee('');
          setShowStartDialog(true);
        }}
      >
        <Play className="w-6 h-6 mr-2" />
        Start Shift
      </Button>

      {/* Start Shift Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-5 h-5 text-green-500" />
              Start Shift
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Select Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-full mt-2">
                  <SelectValue placeholder="Choose your name..." />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter(emp => !allActiveShifts.some(s => s.employee_id === emp.id))
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name} - {emp.position}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedEmployee && allActiveShifts.some(s => s.employee_id === selectedEmployee) && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-600">
                This employee already has an active shift
              </div>
            )}
            
            <Button 
              className="w-full h-12 bg-green-600 hover:bg-green-700"
              onClick={async () => {
                await startShift();
                setShowStartDialog(false);
              }}
              disabled={!selectedEmployee || starting || allActiveShifts.some(s => s.employee_id === selectedEmployee)}
            >
              {starting ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Play className="w-5 h-5 mr-2" />
              )}
              Confirm Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Shift Dialog */}
      <Dialog open={showEndDialog} onOpenChange={(open) => {
        setShowEndDialog(open);
        if (!open) setSelectedShiftToEnd(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              End Shift
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {selectedShiftToEnd && (
              <div className="bg-secondary/30 p-3 rounded-lg">
                <div className="font-medium">{selectedShiftToEnd.employee_name}</div>
                <div className="text-sm text-muted-foreground">
                  Started {selectedShiftToEnd.shift_start ? format(new Date(selectedShiftToEnd.shift_start), 'HH:mm') : ''}
                </div>
              </div>
            )}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
              <p className="text-amber-500 font-medium">⚠️ Important:</p>
              <p className="text-muted-foreground">Enter amounts <strong>excluding</strong> ₱2,000 change fund</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-green-500" />
                  Cash (₱)
                </Label>
                <Input
                  type="number"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="0"
                  className="text-xl h-12 text-center mt-2"
                  autoFocus
                />
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <span className="text-blue-500 font-bold text-sm">G</span>
                  GCash (₱)
                </Label>
                <Input
                  type="number"
                  value={gcashInput}
                  onChange={(e) => setGcashInput(e.target.value)}
                  placeholder="0"
                  className="text-xl h-12 text-center mt-2"
                />
              </div>
            </div>
            
            {/* Total Preview */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-center">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-primary">
                ₱{((parseInt(cashInput) || 0) + (parseInt(gcashInput) || 0)).toLocaleString()}
              </p>
            </div>
            
            <Button 
              onClick={endShift} 
              className="w-full h-12"
              disabled={ending || ((parseInt(cashInput) || 0) + (parseInt(gcashInput) || 0) === 0)}
            >
              {ending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm & End Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Bonus Dialog */}
      <Dialog open={showBonusDialog} onOpenChange={(open) => {
        setShowBonusDialog(open);
        if (!open) setBonusShift(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-green-500" />
              Add Bonus {bonusShift && `- ${bonusShift.employee_name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Bonus Type</Label>
              <Select value={bonusType} onValueChange={setBonusType}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sold_goods">Sold Goods</SelectItem>
                  <SelectItem value="vip_room">VIP Room</SelectItem>
                  <SelectItem value="hookah">Hookah</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={bonusQuantity}
                  onChange={(e) => setBonusQuantity(e.target.value)}
                  min="1"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Amount (₱)</Label>
                <Input
                  type="number"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="0"
                  className="mt-2"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <Label>Comment (optional)</Label>
              <Input
                value={bonusComment}
                onChange={(e) => setBonusComment(e.target.value)}
                placeholder="Add note..."
                className="mt-2"
              />
            </div>
            <Button onClick={addBonus} className="w-full h-12 bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Bonus
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Shift Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              {editingShift ? `Edit ${editingShift.employee_name}'s Shift` : 'Active Shifts'}
            </DialogTitle>
          </DialogHeader>
          {editingShift ? (
            <div className="space-y-4 pt-2">
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="font-medium">{editingShift.employee_name}</div>
                <div className="text-sm text-muted-foreground">
                  {editingShift.date} • Started {editingShift.shift_start ? format(new Date(editingShift.shift_start), 'HH:mm') : '—'}
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <div className="flex gap-2 mt-2">
                    <Select value={editHour} onValueChange={setEditHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => (
                          <SelectItem key={h} value={h.toString()}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="flex items-center text-lg">:</span>
                    <Select value={editMinute} onValueChange={setEditMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['00', '15', '30', '45'].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={editAmPm} onValueChange={(v) => setEditAmPm(v as 'AM' | 'PM')}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AM">AM</SelectItem>
                        <SelectItem value="PM">PM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Base Salary (₱)</Label>
                  <Input
                    type="number"
                    value={editSalary}
                    onChange={(e) => setEditSalary(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingShift(null)} className="flex-1">
                  Back
                </Button>
                <Button onClick={saveShiftEdit} className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {allActiveShifts.length > 0 ? (
                <div className="space-y-2">
                  {allActiveShifts.map((shift) => (
                    <div 
                      key={shift.id} 
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg hover:bg-secondary/70 cursor-pointer"
                      onClick={() => openEditDialog(shift)}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-green-500" />
                        <div>
                          <div className="font-medium">{shift.employee_name}</div>
                          <div className="text-sm text-muted-foreground">
                            Started {shift.shift_start ? format(new Date(shift.shift_start), 'HH:mm') : '—'}
                          </div>
                        </div>
                      </div>
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No active shifts
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Admin Access
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Enter PIN</Label>
              <Input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="****"
                className="text-center text-2xl tracking-widest mt-2"
                maxLength={4}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePinSubmit();
                }}
              />
              {pinError && (
                <p className="text-sm text-destructive mt-2">{pinError}</p>
              )}
            </div>
            <Button onClick={handlePinSubmit} className="w-full">
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
