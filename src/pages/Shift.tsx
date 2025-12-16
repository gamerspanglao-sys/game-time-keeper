import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Clock, Play, Square, Banknote, User, Sun, Moon } from 'lucide-react';

type ShiftType = 'day' | 'night';

interface Employee {
  id: string;
  name: string;
}

interface ActiveShift {
  id: string;
  employee_id: string;
  employee_name: string;
  shift_start: string;
  shift_type: string;
  status: string;
}

const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

const getShiftDate = (): string => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  if (hour < 5) {
    manilaTime.setDate(manilaTime.getDate() - 1);
  }
  return format(manilaTime, 'yyyy-MM-dd');
};

export default function Shift() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Cash handover dialog
  const [showHandoverDialog, setShowHandoverDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [cashAmount, setCashAmount] = useState('');
  const [gcashAmount, setGcashAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentShift = getCurrentShift();
  const currentDate = getShiftDate();

  useEffect(() => {
    loadData();
    
    const channel = supabase
      .channel('shift-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      const [{ data: empData }, { data: shiftsData }] = await Promise.all([
        supabase.from('employees').select('id, name').eq('active', true).order('name'),
        supabase
          .from('shifts')
          .select('id, employee_id, shift_start, shift_type, status, employees!inner(name)')
          .eq('status', 'open')
          .order('shift_start', { ascending: false })
      ]);

      setEmployees(empData || []);
      setActiveShifts((shiftsData || []).map((s: any) => ({
        id: s.id,
        employee_id: s.employee_id,
        employee_name: s.employees?.name || 'Unknown',
        shift_start: s.shift_start,
        shift_type: s.shift_type,
        status: s.status
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const startShift = async (employeeId: string) => {
    const shiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
    
    try {
      const { error } = await supabase.from('shifts').insert({
        employee_id: employeeId,
        date: currentDate,
        shift_start: new Date().toISOString(),
        shift_type: shiftType,
        status: 'open'
      });

      if (error) throw error;
      toast.success('Shift started');
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to start shift');
    }
  };

  const openHandoverDialog = () => {
    setSelectedEmployee('');
    setCashAmount('');
    setGcashAmount('');
    setShowHandoverDialog(true);
  };

  const submitCashHandover = async () => {
    if (!selectedEmployee) {
      toast.error('Select employee');
      return;
    }

    const cash = parseInt(cashAmount) || 0;
    const gcash = parseInt(gcashAmount) || 0;

    if (cash === 0 && gcash === 0) {
      toast.error('Enter amount');
      return;
    }

    setSubmitting(true);
    try {
      // Find active shift for this employee
      const activeShift = activeShifts.find(s => s.employee_id === selectedEmployee);

      if (activeShift) {
        // Update existing shift with cash handover
        const { error } = await supabase
          .from('shifts')
          .update({
            cash_handed_over: cash,
            gcash_handed_over: gcash,
            shift_end: new Date().toISOString(),
            status: 'closed'
          })
          .eq('id', activeShift.id);

        if (error) throw error;
      } else {
        // Create new shift record with cash handover (employee closing without starting)
        const shiftType = currentShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
        
        const { error } = await supabase.from('shifts').insert({
          employee_id: selectedEmployee,
          date: currentDate,
          shift_start: new Date().toISOString(),
          shift_end: new Date().toISOString(),
          shift_type: shiftType,
          cash_handed_over: cash,
          gcash_handed_over: gcash,
          status: 'closed'
        });

        if (error) throw error;
      }

      // Send Telegram notification
      try {
        const employeeName = employees.find(e => e.id === selectedEmployee)?.name || 'Unknown';
        await supabase.functions.invoke('telegram-notify', {
          body: {
            message: `💰 Cash Handover\n\nEmployee: ${employeeName}\nCash: ₱${cash.toLocaleString()}\nGCash: ₱${gcash.toLocaleString()}\nTotal: ₱${(cash + gcash).toLocaleString()}\n\nPending admin verification in Cash page.`
          }
        });
      } catch (e) {
        console.log('Telegram notification failed:', e);
      }

      toast.success('Cash submitted for verification');
      setShowHandoverDialog(false);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error('Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const getEmployeeShift = (employeeId: string) => {
    return activeShifts.find(s => s.employee_id === employeeId);
  };

  const formatDuration = (start: string) => {
    const startTime = new Date(start).getTime();
    const now = Date.now();
    const diff = now - startTime;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Shift</h1>
          <Badge variant="outline" className="ml-2">
            {currentShift === 'day' ? <Sun className="w-3 h-3 mr-1" /> : <Moon className="w-3 h-3 mr-1" />}
            {currentShift === 'day' ? 'Day' : 'Night'}
          </Badge>
        </div>
        
        <Button onClick={openHandoverDialog} className="gap-2">
          <Banknote className="w-4 h-4" />
          Submit Cash
        </Button>
      </div>

      {/* Active Shifts */}
      {activeShifts.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Play className="w-4 h-4 text-green-500" />
              Active Shifts
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2 space-y-2">
            {activeShifts.map(shift => (
              <div key={shift.id} className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{shift.employee_name}</span>
                </div>
                <Badge variant="secondary" className="bg-green-500/20 text-green-500">
                  {formatDuration(shift.shift_start)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Employees */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Employees</CardTitle>
        </CardHeader>
        <CardContent className="py-2 space-y-2">
          {employees.map(emp => {
            const activeShift = getEmployeeShift(emp.id);
            return (
              <div key={emp.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{emp.name}</span>
                </div>
                {activeShift ? (
                  <Badge variant="outline" className="text-green-500 border-green-500/30">
                    Working
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => startShift(emp.id)}>
                    <Play className="w-3 h-3 mr-1" />
                    Start
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Cash Handover Dialog */}
      <Dialog open={showHandoverDialog} onOpenChange={setShowHandoverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              Cash Handover
            </DialogTitle>
            <DialogDescription>
              Submit cash collected during shift for admin verification
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Employee</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Cash ₱</label>
                <Input
                  type="number"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">GCash ₱</label>
                <Input
                  type="number"
                  value={gcashAmount}
                  onChange={e => setGcashAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowHandoverDialog(false)}>Cancel</Button>
              <Button onClick={submitCashHandover} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
