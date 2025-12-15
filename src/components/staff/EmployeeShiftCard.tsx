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
import { Play, Square, Clock, Wallet, Gift, Plus, Loader2 } from 'lucide-react';

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

interface Bonus {
  id: string;
  bonus_type: string;
  quantity: number;
  amount: number;
  comment: string | null;
}

export function EmployeeShiftCard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [shiftBonuses, setShiftBonuses] = useState<Bonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  
  // End shift dialog
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [cashInput, setCashInput] = useState('');
  
  // Bonus dialog
  const [showBonusDialog, setShowBonusDialog] = useState(false);
  const [bonusType, setBonusType] = useState<string>('sold_goods');
  const [bonusQuantity, setBonusQuantity] = useState('1');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusComment, setBonusComment] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    if (selectedEmployee) {
      loadActiveShift();
    }
  }, [selectedEmployee]);

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
      const difference = cashAmount - (activeShift.expected_cash || 0);

      const { error } = await supabase
        .from('shifts')
        .update({
          shift_end: now.toISOString(),
          total_hours: Math.round(totalHours * 100) / 100,
          cash_handed_over: cashAmount,
          cash_difference: difference,
          status: 'closed'
        })
        .eq('id', activeShift.id);

      if (error) throw error;

      // Calculate total bonuses
      const totalBonuses = shiftBonuses.reduce((sum, b) => sum + b.amount, 0);

      // Send Telegram notification
      const employee = employees.find(e => e.id === selectedEmployee);
      await supabase.functions.invoke('telegram-notify', {
        body: { 
          action: 'shift_end',
          employeeName: employee?.name,
          totalHours: totalHours.toFixed(1),
          cashHandedOver: cashAmount,
          expectedCash: activeShift.expected_cash || 0,
          difference: difference,
          bonuses: totalBonuses,
          baseSalary: activeShift.base_salary
        }
      });

      toast.success('Shift ended!');
      setActiveShift(null);
      setShiftBonuses([]);
      setCashInput('');
      setShowEndDialog(false);
    } catch (error) {
      console.error('Error ending shift:', error);
      toast.error('Failed to end shift');
    } finally {
      setEnding(false);
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
      {/* Employee Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Select Employee</CardTitle>
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
                      <Clock className="w-5 h-5 text-green-500" />
                      <span className="font-medium">Shift Active</span>
                    </div>
                    <Badge variant="default" className="bg-green-500">
                      Started {format(new Date(activeShift.shift_start!), 'HH:mm')}
                    </Badge>
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
            <div>
              <Label>Cash Handed Over (₱)</Label>
              <Input
                type="number"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="Enter amount"
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
    </div>
  );
}
