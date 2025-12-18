import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, subDays, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { FileSpreadsheet, Download, Loader2, RefreshCw, Check, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { ActivityLogger } from '@/lib/activityLogger';
import * as XLSX from 'xlsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ShiftEntry {
  id: string;
  date: string;
  employee_id: string;
  employee_name: string;
  shift_type: string;
  total_hours: number;
  base_salary: number;
  salary_paid: boolean;
  salary_paid_amount: number | null;
  cash_shortage: number;
}

interface PayrollEntry {
  employee_id: string;
  employee_name: string;
  total_shifts: number;
  total_hours: number;
  base_salary_total: number;
  bonuses_total: number;
  cash_shortage_total: number;
  total_salary: number;
  paid_amount: number;
  unpaid_amount: number;
}

interface InvestorContribution {
  id: string;
  date: string;
  contribution_type: 'returnable' | 'non_returnable';
  category: string;
  amount: number;
  description: string | null;
}

export function PayrollReport() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('payroll');
  const [dateFrom, setDateFrom] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [contributions, setContributions] = useState<InvestorContribution[]>([]);
  
  // New contribution form
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('purchases');
  const [newType, setNewType] = useState<'returnable' | 'non_returnable'>('returnable');
  const [newDescription, setNewDescription] = useState('');

  const syncToGoogleSheets = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets-sync');
      if (error) throw error;
      toast.success('Synced to Google Sheets');
      ActivityLogger.syncSheets('success');
    } catch (error) {
      console.error('Error syncing to Google Sheets:', error);
      toast.error('Failed to sync to Google Sheets');
    } finally {
      setSyncing(false);
    }
  };

  const loadShifts = async () => {
    const { data, error } = await supabase
      .from('shifts')
      .select(`*, employees (id, name)`)
      .eq('status', 'closed')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error loading shifts:', error);
      return;
    }

    const shiftEntries: ShiftEntry[] = (data || []).map((s: any) => ({
      id: s.id,
      date: s.date,
      employee_id: s.employee_id,
      employee_name: s.employees?.name || 'Unknown',
      shift_type: s.shift_type || '12 hours',
      total_hours: Number(s.total_hours) || 0,
      base_salary: s.base_salary || 500,
      salary_paid: s.salary_paid || false,
      salary_paid_amount: s.salary_paid_amount,
      cash_shortage: s.cash_shortage || 0
    }));

    setShifts(shiftEntries);
  };

  const loadContributions = async () => {
    const { data, error } = await supabase
      .from('investor_contributions')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false });

    if (!error && data) {
      setContributions(data as InvestorContribution[]);
    }
  };

  const loadPayroll = async () => {
    setLoading(true);
    try {
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select(`*, employees (id, name)`)
        .eq('status', 'closed')
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (shiftsError) throw shiftsError;

      const { data: bonuses, error: bonusesError } = await supabase
        .from('bonuses')
        .select('*')
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (bonusesError) throw bonusesError;

      const employeeMap = new Map<string, PayrollEntry>();

      shiftsData?.forEach((shift: any) => {
        const empId = shift.employee_id;
        const empName = shift.employees?.name || 'Unknown';
        
        if (!employeeMap.has(empId)) {
          employeeMap.set(empId, {
            employee_id: empId,
            employee_name: empName,
            total_shifts: 0,
            total_hours: 0,
            base_salary_total: 0,
            bonuses_total: 0,
            cash_shortage_total: 0,
            total_salary: 0,
            paid_amount: 0,
            unpaid_amount: 0
          });
        }

        const entry = employeeMap.get(empId)!;
        entry.total_shifts += 1;
        entry.total_hours += Number(shift.total_hours) || 0;
        entry.base_salary_total += shift.base_salary || 500;
        entry.cash_shortage_total += shift.cash_shortage || 0;
        
        if (shift.salary_paid) {
          entry.paid_amount += shift.salary_paid_amount || shift.base_salary || 500;
        }
      });

      bonuses?.forEach((bonus: any) => {
        const empId = bonus.employee_id;
        if (employeeMap.has(empId)) {
          employeeMap.get(empId)!.bonuses_total += bonus.amount;
        }
      });

      employeeMap.forEach((entry) => {
        entry.total_salary = entry.base_salary_total + entry.bonuses_total - entry.cash_shortage_total;
        entry.unpaid_amount = entry.total_salary - entry.paid_amount;
      });

      setPayroll(Array.from(employeeMap.values()).sort((a, b) => 
        a.employee_name.localeCompare(b.employee_name)
      ));

      await loadShifts();
      await loadContributions();
    } catch (error) {
      console.error('Error loading payroll:', error);
      toast.error('Failed to load payroll');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayroll();
  }, [dateFrom, dateTo]);

  const toggleSalaryPaid = async (shiftId: string, currentPaid: boolean, amount: number, employeeName: string) => {
    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          salary_paid: !currentPaid,
          salary_paid_at: !currentPaid ? new Date().toISOString() : null,
          salary_paid_amount: !currentPaid ? amount : null
        })
        .eq('id', shiftId);

      if (error) throw error;
      
      toast.success(currentPaid ? 'Marked as unpaid' : 'Marked as paid');
      if (!currentPaid) {
        ActivityLogger.salaryPaid(employeeName, amount);
      }
      loadPayroll();
    } catch (error) {
      console.error('Error updating salary status:', error);
      toast.error('Failed to update');
    }
  };

  const addContribution = async () => {
    if (!newAmount || isNaN(Number(newAmount))) {
      toast.error('Enter valid amount');
      return;
    }

    try {
      const { error } = await supabase
        .from('investor_contributions')
        .insert({
          date: format(new Date(), 'yyyy-MM-dd'),
          contribution_type: newType,
          category: newCategory,
          amount: Number(newAmount),
          description: newDescription || null
        });

      if (error) throw error;
      
      toast.success('Contribution added');
      setNewAmount('');
      setNewDescription('');
      loadContributions();
    } catch (error) {
      console.error('Error adding contribution:', error);
      toast.error('Failed to add');
    }
  };

  const deleteContribution = async (id: string) => {
    try {
      const { error } = await supabase
        .from('investor_contributions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Deleted');
      loadContributions();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete');
    }
  };

  const exportToExcel = () => {
    if (payroll.length === 0) {
      toast.error('No data to export');
      return;
    }

    const wsData = [
      ['Payroll Report', `${dateFrom} to ${dateTo}`],
      [],
      ['Employee', 'Shifts', 'Hours', 'Base', 'Bonuses', 'Total', 'Paid', 'Unpaid'],
      ...payroll.map(p => [
        p.employee_name,
        p.total_shifts,
        p.total_hours.toFixed(1),
        p.base_salary_total,
        p.bonuses_total,
        p.total_salary,
        p.paid_amount,
        p.unpaid_amount
      ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `payroll-${dateFrom}-to-${dateTo}.xlsx`);
    toast.success('Exported');
  };

  const totalSalary = payroll.reduce((s, p) => s + p.total_salary, 0);
  const totalPaid = payroll.reduce((s, p) => s + p.paid_amount, 0);
  const totalUnpaid = payroll.reduce((s, p) => s + p.unpaid_amount, 0);
  const totalShifts = payroll.reduce((s, p) => s + p.total_shifts, 0);
  
  const returnableTotal = contributions.filter(c => c.contribution_type === 'returnable').reduce((s, c) => s + c.amount, 0);
  const nonReturnableTotal = contributions.filter(c => c.contribution_type === 'non_returnable').reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            setDateFrom(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
            setDateTo(format(new Date(), 'yyyy-MM-dd'));
          }}>This Week</Button>
          <Button variant="outline" size="sm" onClick={() => {
            setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
            setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
          }}>This Month</Button>
          <Button variant="outline" size="sm" onClick={syncToGoogleSheets} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sheets
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />Export
          </Button>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary/30">
          <TabsTrigger value="payroll" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />Payroll
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Check className="w-4 h-4" />Payments
          </TabsTrigger>
          <TabsTrigger value="investor" className="gap-2">
            <DollarSign className="w-4 h-4" />Investor
          </TabsTrigger>
        </TabsList>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll" className="space-y-4">
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileSpreadsheet className="w-5 h-5" />Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Shifts</div>
                  <div className="text-lg font-bold">{totalShifts}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Salary</div>
                  <div className="text-lg font-bold">₱{totalSalary.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Paid</div>
                  <div className="text-lg font-bold text-green-500">₱{totalPaid.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Unpaid</div>
                  <div className="text-lg font-bold text-red-500">₱{totalUnpaid.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Employees</div>
                  <div className="text-lg font-bold">{payroll.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : payroll.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No data</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-semibold">Employee</th>
                        <th className="text-right py-3 px-4 font-semibold">Shifts</th>
                        <th className="text-right py-3 px-4 font-semibold">Hours</th>
                        <th className="text-right py-3 px-4 font-semibold">Total</th>
                        <th className="text-right py-3 px-4 font-semibold text-green-500">Paid</th>
                        <th className="text-right py-3 px-4 font-semibold text-red-500">Unpaid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payroll.map((entry) => (
                        <tr key={entry.employee_id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{entry.employee_name}</td>
                          <td className="text-right py-3 px-4">{entry.total_shifts}</td>
                          <td className="text-right py-3 px-4">{entry.total_hours.toFixed(1)}</td>
                          <td className="text-right py-3 px-4 font-bold">₱{entry.total_salary.toLocaleString()}</td>
                          <td className="text-right py-3 px-4 text-green-500">₱{entry.paid_amount.toLocaleString()}</td>
                          <td className="text-right py-3 px-4 text-red-500">
                            {entry.unpaid_amount > 0 ? `₱${entry.unpaid_amount.toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYMENTS TAB */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Mark Shifts as Paid</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {shifts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No shifts</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-semibold">Date</th>
                        <th className="text-left py-3 px-4 font-semibold">Employee</th>
                        <th className="text-right py-3 px-4 font-semibold">Hours</th>
                        <th className="text-right py-3 px-4 font-semibold">Amount</th>
                        <th className="text-center py-3 px-4 font-semibold">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shifts.map((shift) => (
                        <tr key={shift.id} className={`border-b hover:bg-muted/50 ${shift.salary_paid ? 'bg-green-500/5' : ''}`}>
                          <td className="py-3 px-4">{shift.date}</td>
                          <td className="py-3 px-4 font-medium">{shift.employee_name}</td>
                          <td className="text-right py-3 px-4">{shift.total_hours.toFixed(1)}</td>
                          <td className="text-right py-3 px-4">₱{shift.base_salary.toLocaleString()}</td>
                          <td className="text-center py-3 px-4">
                            <Checkbox
                              checked={shift.salary_paid}
                              onCheckedChange={() => toggleSalaryPaid(shift.id, shift.salary_paid, shift.base_salary, shift.employee_name)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVESTOR TAB */}
        <TabsContent value="investor" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg text-blue-500">
                  <TrendingUp className="w-5 h-5" />Оборотные (Returnable)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₱{returnableTotal.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Вложено в закупки товара</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-r from-orange-500/10 to-orange-500/5 border-orange-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg text-orange-500">
                  <TrendingDown className="w-5 h-5" />Невозвратные (Non-returnable)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₱{nonReturnableTotal.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Зарплаты, еда, прочие расходы</p>
              </CardContent>
            </Card>
          </div>

          {/* Add contribution form */}
          <Card className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as 'returnable' | 'non_returnable')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="returnable">Оборотные</SelectItem>
                    <SelectItem value="non_returnable">Невозвратные</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchases">Закупки</SelectItem>
                    <SelectItem value="salaries">Зарплаты</SelectItem>
                    <SelectItem value="food">Еда</SelectItem>
                    <SelectItem value="other">Прочее</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Amount</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  placeholder="Optional description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
              <Button onClick={addContribution}>Add</Button>
            </div>
          </Card>

          {/* Contributions list */}
          <Card>
            <CardContent className="p-0">
              {contributions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No contributions</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left py-3 px-4 font-semibold">Date</th>
                        <th className="text-left py-3 px-4 font-semibold">Type</th>
                        <th className="text-left py-3 px-4 font-semibold">Category</th>
                        <th className="text-right py-3 px-4 font-semibold">Amount</th>
                        <th className="text-left py-3 px-4 font-semibold">Description</th>
                        <th className="text-center py-3 px-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map((c) => (
                        <tr key={c.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-4">{c.date}</td>
                          <td className="py-3 px-4">
                            <Badge variant={c.contribution_type === 'returnable' ? 'default' : 'secondary'}>
                              {c.contribution_type === 'returnable' ? '🔄 Оборотные' : '❌ Невозвратные'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">{c.category}</td>
                          <td className="text-right py-3 px-4 font-medium">₱{c.amount.toLocaleString()}</td>
                          <td className="py-3 px-4 text-muted-foreground">{c.description || '—'}</td>
                          <td className="text-center py-3 px-4">
                            <Button variant="ghost" size="sm" onClick={() => deleteContribution(c.id)}>✕</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}