import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Sun, Moon, Clock, Users, Calendar, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface EmployeeStats {
  id: string;
  name: string;
  total_shifts: number;
  day_shifts: number;
  night_shifts: number;
  total_hours: number;
  avg_hours_per_shift: number;
}

export function ShiftDashboard() {
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [period, setPeriod] = useState('current');
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
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

    loadStats();
  }, [period]);

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
        </h3>
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
                  <Badge variant="secondary" className="text-xs">
                    {emp.total_shifts} shifts
                  </Badge>
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
    </div>
  );
}
