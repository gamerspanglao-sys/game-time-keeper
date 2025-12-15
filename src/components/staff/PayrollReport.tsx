import { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface PayrollEntry {
  employee_id: string;
  employee_name: string;
  total_shifts: number;
  total_hours: number;
  base_salary_total: number;
  bonuses_total: number;
  total_salary: number;
}

export function PayrollReport() {
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payroll, setPayroll] = useState<PayrollEntry[]>([]);

  const loadPayroll = async () => {
    setLoading(true);
    try {
      // Get all closed shifts in period
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select(`
          *,
          employees (id, name)
        `)
        .eq('status', 'closed')
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (shiftsError) throw shiftsError;

      // Get all bonuses in period
      const { data: bonuses, error: bonusesError } = await supabase
        .from('bonuses')
        .select('*')
        .gte('date', dateFrom)
        .lte('date', dateTo);

      if (bonusesError) throw bonusesError;

      // Aggregate by employee
      const employeeMap = new Map<string, PayrollEntry>();

      shifts?.forEach((shift: any) => {
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
            total_salary: 0
          });
        }

        const entry = employeeMap.get(empId)!;
        entry.total_shifts += 1;
        entry.total_hours += Number(shift.total_hours) || 0;
        entry.base_salary_total += shift.base_salary || 500;
      });

      bonuses?.forEach((bonus: any) => {
        const empId = bonus.employee_id;
        if (employeeMap.has(empId)) {
          employeeMap.get(empId)!.bonuses_total += bonus.amount;
        }
      });

      // Calculate totals
      employeeMap.forEach((entry) => {
        entry.total_salary = entry.base_salary_total + entry.bonuses_total;
      });

      setPayroll(Array.from(employeeMap.values()).sort((a, b) => 
        a.employee_name.localeCompare(b.employee_name)
      ));
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

  const exportToExcel = () => {
    if (payroll.length === 0) {
      toast.error('No data to export');
      return;
    }

    const wsData = [
      ['Payroll Report', `${dateFrom} to ${dateTo}`],
      [],
      ['Employee', 'Total Shifts', 'Total Hours', 'Base Salary', 'Bonuses', 'Total Salary'],
      ...payroll.map(p => [
        p.employee_name,
        p.total_shifts,
        p.total_hours.toFixed(1),
        p.base_salary_total,
        p.bonuses_total,
        p.total_salary
      ]),
      [],
      ['TOTALS', 
        payroll.reduce((s, p) => s + p.total_shifts, 0),
        payroll.reduce((s, p) => s + p.total_hours, 0).toFixed(1),
        payroll.reduce((s, p) => s + p.base_salary_total, 0),
        payroll.reduce((s, p) => s + p.bonuses_total, 0),
        payroll.reduce((s, p) => s + p.total_salary, 0)
      ]
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    XLSX.writeFile(wb, `payroll-${dateFrom}-to-${dateTo}.xlsx`);
    toast.success('Exported to Excel');
  };

  const totalSalary = payroll.reduce((s, p) => s + p.total_salary, 0);
  const totalShifts = payroll.reduce((s, p) => s + p.total_shifts, 0);
  const totalBonuses = payroll.reduce((s, p) => s + p.bonuses_total, 0);

  return (
    <div className="space-y-4">
      {/* Date Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
              setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
            }}
          >
            This Month
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              const today = new Date();
              setDateFrom(format(subDays(today, 7), 'yyyy-MM-dd'));
              setDateTo(format(today, 'yyyy-MM-dd'));
            }}
          >
            Last 7 Days
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </Card>

      {/* Summary */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5" />
            Payroll Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Employees</div>
              <div className="text-lg font-bold">{payroll.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Shifts</div>
              <div className="text-lg font-bold">{totalShifts}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Bonuses</div>
              <div className="text-lg font-bold text-green-500">₱{totalBonuses.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Payroll</div>
              <div className="text-lg font-bold">₱{totalSalary.toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payroll Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payroll.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No payroll data for this period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold">Employee</th>
                    <th className="text-right py-3 px-4 font-semibold">Shifts</th>
                    <th className="text-right py-3 px-4 font-semibold">Hours</th>
                    <th className="text-right py-3 px-4 font-semibold">Base</th>
                    <th className="text-right py-3 px-4 font-semibold text-green-500">Bonuses</th>
                    <th className="text-right py-3 px-4 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((entry) => (
                    <tr key={entry.employee_id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">{entry.employee_name}</td>
                      <td className="text-right py-3 px-4">{entry.total_shifts}</td>
                      <td className="text-right py-3 px-4">{entry.total_hours.toFixed(1)}</td>
                      <td className="text-right py-3 px-4">₱{entry.base_salary_total.toLocaleString()}</td>
                      <td className="text-right py-3 px-4 text-green-500">
                        {entry.bonuses_total > 0 ? `+₱${entry.bonuses_total.toLocaleString()}` : '—'}
                      </td>
                      <td className="text-right py-3 px-4 font-bold">₱{entry.total_salary.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-bold">
                  <tr>
                    <td className="py-3 px-4">TOTAL</td>
                    <td className="text-right py-3 px-4">{totalShifts}</td>
                    <td className="text-right py-3 px-4">{payroll.reduce((s, p) => s + p.total_hours, 0).toFixed(1)}</td>
                    <td className="text-right py-3 px-4">₱{payroll.reduce((s, p) => s + p.base_salary_total, 0).toLocaleString()}</td>
                    <td className="text-right py-3 px-4 text-green-500">₱{totalBonuses.toLocaleString()}</td>
                    <td className="text-right py-3 px-4">₱{totalSalary.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
