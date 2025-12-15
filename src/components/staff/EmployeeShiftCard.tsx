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
  
  // Live timer
  const [elapsedTime, setElapsedTime] = useState<string>('00:00:00');
  const currentShiftType = getCurrentShiftType();
  
  // End shift dialog
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [cashInput, setCashInput] = useState('');
  
  // PIN dialog for admin
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Edit shift dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<ActiveShiftWithEmployee | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Bonus dialog
  const [showBonusDialog, setShowBonusDialog] = useState(false);
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
    if (!activeShift || !cashInput) {
      toast.error('Enter cash amount');
      return;
    }

    setEnding(true);
    try {
      const now = new Date();
      const startTime = new Date(activeShift.shift_start!);
      const totalHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      const cashAmount = parseInt(cashInput);
      
      // Get expected cash from cash_register for this shift
      const shiftDate = format(startTime, 'yyyy-MM-dd');
      const { data: cashRecord } = await supabase
        .from('cash_register')
        .select('*')
        .eq('date', shiftDate)
        .eq('shift', currentShiftType)
        .maybeSingle();
      
      const expectedCash = cashRecord?.expected_sales || 0;
      const totalExpenses = (cashRecord?.purchases || 0) + (cashRecord?.salaries || 0) + (cashRecord?.other_expenses || 0);
      const calculatedExpected = (cashRecord?.opening_balance || 0) + expectedCash - totalExpenses;
      const discrepancy = cashAmount - calculatedExpected;

      // Update shift with cash data
      const { error } = await supabase
        .from('shifts')
        .update({
          shift_end: now.toISOString(),
          total_hours: Math.round(totalHours * 100) / 100,
          cash_handed_over: cashAmount,
          cash_difference: discrepancy,
          expected_cash: calculatedExpected,
          status: 'closed'
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      // Update cash_register with actual cash
      if (cashRecord) {
        await supabase
          .from('cash_register')
          .update({
            actual_cash: cashAmount,
            discrepancy: discrepancy
          })
          .eq('id', cashRecord.id);
      } else {
        // Create new cash_register entry if doesn't exist
        await supabase
          .from('cash_register')
          .insert({
            date: shiftDate,
            shift: currentShiftType,
            actual_cash: cashAmount,
            discrepancy: discrepancy
          });
      }

      // Calculate total bonuses
      const totalBonusAmount = shiftBonuses.reduce((sum, b) => sum + b.amount, 0);

      // Send Telegram notification
      const employee = employees.find(e => e.id === selectedEmployee);
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'shift_end',
          employeeName: employee?.name,
          totalHours: totalHours.toFixed(1),
          cashHandedOver: cashAmount,
          expectedCash: calculatedExpected,
          difference: discrepancy,
          bonuses: totalBonusAmount,
          baseSalary: activeShift.base_salary
        }
      });

      // Show success with discrepancy info
      if (discrepancy !== 0) {
        toast.warning(`Shift ended! Cash discrepancy: ${discrepancy > 0 ? '+' : ''}₱${discrepancy.toLocaleString()}`);
      } else {
        toast.success('Shift ended! Cash matches expected.');
      }
      
      setActiveShift(null);
      setShiftBonuses([]);
      setCashInput('');
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
    if (!activeShift || !bonusAmount) {
      toast.error('Enter bonus amount');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bonuses')
        .insert({
          shift_id: activeShift.id,
          employee_id: selectedEmployee,
          date: format(new Date(), 'yyyy-MM-dd'),
          bonus_type: bonusType,
          quantity: parseInt(bonusQuantity) || 1,
          amount: parseInt(bonusAmount),
          comment: bonusComment || null
        })
        .select()
        .single();

      if (error) throw error;

      setShiftBonuses([...shiftBonuses, data]);
      toast.success('Bonus added!');
      
      // Reset form
      setBonusAmount('');
      setBonusQuantity('1');
      setBonusComment('');
      setShowBonusDialog(false);

      // Send Telegram notification
      const employee = employees.find(e => e.id === selectedEmployee);
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'bonus_added',
          employeeName: employee?.name,
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
    // Format start time for input
    if (shift.shift_start) {
      const startDate = new Date(shift.shift_start);
      setEditStartTime(format(startDate, 'HH:mm'));
    } else {
      setEditStartTime('');
    }
    setEditSalary(shift.base_salary?.toString() || '500');
    setShowEditDialog(true);
  };

  const saveShiftEdit = async () => {
    if (!editingShift || !editStartTime) return;

    setSaving(true);
    try {
      // Parse the new start time and combine with the shift date
      const [hours, minutes] = editStartTime.split(':').map(Number);
      const shiftDate = new Date(editingShift.date + 'T00:00:00');
      shiftDate.setHours(hours, minutes, 0, 0);
      
      // Calculate hours if shift is closed
      let totalHours = editingShift.total_hours;
      if (editingShift.status === 'closed' && editingShift.shift_end) {
        const endTime = new Date(editingShift.shift_end);
        totalHours = (endTime.getTime() - shiftDate.getTime()) / (1000 * 60 * 60);
        totalHours = Math.round(totalHours * 100) / 100;
      }

      const { error } = await supabase
        .from('shifts')
        .update({
          shift_start: shiftDate.toISOString(),
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

  return (
    <div className="space-y-6">
      {/* Current Shift - All Employees On Duty */}
      <Card className={currentShiftType === 'day' 
        ? "border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-amber-500/10" 
        : "border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 to-indigo-500/10"
      }>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentShiftType === 'day' ? (
                <Sun className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-500" />
              )}
              <span>{currentShiftType === 'day' ? 'Day Shift' : 'Night Shift'}</span>
              <Badge variant="secondary" className="text-xs">
                {currentShiftType === 'day' ? '5AM - 5PM' : '5PM - 5AM'}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={requestAdminEdit}>
              <Lock className="w-4 h-4 mr-1" />
              Edit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allActiveShifts.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                On duty: {allActiveShifts.length} employee{allActiveShifts.length > 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-2">
                {allActiveShifts.map((shift) => (
                  <Badge 
                    key={shift.id} 
                    variant="default" 
                    className="px-3 py-1.5"
                  >
                    <Clock className="w-3 h-3 mr-1.5" />
                    {shift.employee_name}
                    <span className="ml-1.5 text-xs opacity-75">
                      {shift.shift_start ? format(new Date(shift.shift_start), 'HH:mm') : ''}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No employees on shift</div>
          )}
        </CardContent>
      </Card>

      {/* Employee Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Start Your Shift</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose your name..." />
            </SelectTrigger>
            <SelectContent>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} - {emp.position}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedEmployee && (
        <>
          {/* Active Shift Status */}
          <Card className={activeShift 
            ? "border-green-500/50 bg-gradient-to-br from-green-500/5 to-green-500/10" 
            : "border-muted"
          }>
            <CardContent className="pt-6">
              {activeShift ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-green-500 animate-pulse" />
                      <span className="font-medium">Shift Active</span>
                    </div>
                    <Badge variant="default" className="bg-green-500">
                      Started {format(new Date(activeShift.shift_start!), 'HH:mm')}
                    </Badge>
                  </div>
                  
                  {/* Live Timer */}
                  <div className="text-center py-4 bg-green-500/10 rounded-lg border border-green-500/30">
                    <div className="text-4xl font-mono font-bold text-green-500">{elapsedTime}</div>
                    <div className="text-sm text-muted-foreground mt-1">Shift Duration</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Base Salary</div>
                      <div className="font-bold text-lg">₱{activeShift.base_salary}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Bonuses</div>
                      <div className="font-bold text-lg text-green-500">+₱{totalBonuses}</div>
                    </div>
                  </div>

                  {shiftBonuses.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">Added Bonuses:</div>
                      {shiftBonuses.map((bonus) => (
                        <div key={bonus.id} className="flex justify-between text-sm bg-secondary/50 p-2 rounded">
                          <span>{getBonusTypeLabel(bonus.bonus_type)} x{bonus.quantity}</span>
                          <span className="font-medium">₱{bonus.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button 
                      variant="outline"
                      className="h-14"
                      onClick={() => setShowBonusDialog(true)}
                    >
                      <Gift className="w-5 h-5 mr-2" />
                      Add Bonus
                    </Button>
                    <Button 
                      variant="destructive"
                      className="h-14"
                      onClick={() => setShowEndDialog(true)}
                    >
                      <Square className="w-5 h-5 mr-2" />
                      End Shift
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="text-muted-foreground">No active shift</div>
                  <Button 
                    size="lg"
                    className="w-full h-16 text-lg bg-green-600 hover:bg-green-700"
                    onClick={startShift}
                    disabled={starting}
                  >
                    {starting ? (
                      <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-6 h-6 mr-2" />
                    )}
                    Start Shift
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* End Shift Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              End Shift - Enter Cash
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
              <p className="text-amber-500 font-medium">⚠️ Important:</p>
              <p className="text-muted-foreground">Enter cash amount <strong>excluding</strong> the ₱2,000 change fund (which stays in the register)</p>
            </div>
            <div>
              <Label>Cash Handed Over (₱)</Label>
              <Input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="Enter amount (without 2000₱ change)"
                className="text-2xl h-14 text-center mt-2"
                autoFocus
              />
            </div>
            <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Salary:</span>
                <span>₱{activeShift?.base_salary || 500}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bonuses:</span>
                <span className="text-green-500">+₱{totalBonuses}</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total Earnings:</span>
                <span>₱{(activeShift?.base_salary || 500) + totalBonuses}</span>
              </div>
            </div>
            <Button 
              onClick={endShift} 
              className="w-full h-12"
              disabled={ending || !cashInput}
            >
              {ending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm & End Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Bonus Dialog */}
      <Dialog open={showBonusDialog} onOpenChange={setShowBonusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-green-500" />
              Add Bonus
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
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Shift Start Time</Label>
                  <Input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="mt-2"
                  />
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
