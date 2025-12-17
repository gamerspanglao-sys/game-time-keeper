import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Check, X, AlertTriangle, TrendingUp, TrendingDown, 
  Banknote, Smartphone, Loader2, Clock, Users
} from 'lucide-react';

interface PendingShift {
  id: string;
  date: string;
  shift_type: string | null;
  employee_id: string;
  employee_name: string;
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
  cash_approved: boolean;
}

interface PendingExpense {
  id: string;
  date: string;
  shift: string;
  category: string;
  amount: number;
  description: string | null;
  payment_source: string;
  approved: boolean;
}

interface CashRegisterRecord {
  id: string;
  date: string;
  shift: string;
  cash_expected: number | null;
  gcash_expected: number | null;
}

interface PendingVerification {
  date: string;
  shift: string;
  cashExpected: number;
  gcashExpected: number;
  cashSubmitted: number;
  gcashSubmitted: number;
  totalExpected: number;
  totalSubmitted: number;
  difference: number;
  shifts: PendingShift[];
  expenses: PendingExpense[];
}

const getCategoryLabel = (v: string) => {
  const labels: Record<string, string> = {
    'purchases': 'Purchases',
    'employee_food': 'Employee Food',
    'food_hunters': 'Food Hunters',
    'equipment': 'Equipment',
    'inventory': 'Inventory',
    'salaries': 'Salaries',
    'other': 'Other'
  };
  return labels[v] || v;
};

export function CashVerification() {
  const [loading, setLoading] = useState(true);
  const [pendingVerifications, setPendingVerifications] = useState<PendingVerification[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);
  const [shortageInputs, setShortageInputs] = useState<Record<string, Record<string, string>>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const loadPendingData = async () => {
    try {
      // Load unapproved shifts
      const { data: shifts } = await supabase
        .from('shifts')
        .select('*, employees(name)')
        .eq('status', 'closed')
        .eq('cash_approved', false)
        .not('cash_handed_over', 'is', null)
        .order('date', { ascending: false });

      // Load unapproved expenses
      const { data: expenses } = await supabase
        .from('cash_expenses')
        .select('*')
        .eq('approved', false)
        .order('date', { ascending: false });

      // Load cash register records for expected values
      const { data: registers } = await supabase
        .from('cash_register')
        .select('id, date, shift, cash_expected, gcash_expected')
        .order('date', { ascending: false });

      setPendingExpenses((expenses || []) as PendingExpense[]);

      // Group shifts by date+shift
      const groupedVerifications: Record<string, PendingVerification> = {};
      
      (shifts || []).forEach((s: any) => {
        const shiftType = s.shift_type?.includes('Night') || s.shift_type === '12 hours' ? 'night' : 'day';
        const key = `${s.date}-${shiftType}`;
        
        if (!groupedVerifications[key]) {
          const register = registers?.find(r => r.date === s.date && r.shift === shiftType);
          groupedVerifications[key] = {
            date: s.date,
            shift: shiftType,
            cashExpected: register?.cash_expected || 0,
            gcashExpected: register?.gcash_expected || 0,
            cashSubmitted: 0,
            gcashSubmitted: 0,
            totalExpected: 0,
            totalSubmitted: 0,
            difference: 0,
            shifts: [],
            expenses: []
          };
        }
        
        groupedVerifications[key].shifts.push({
          id: s.id,
          date: s.date,
          shift_type: s.shift_type,
          employee_id: s.employee_id,
          employee_name: s.employees?.name || 'Unknown',
          cash_handed_over: s.cash_handed_over,
          gcash_handed_over: s.gcash_handed_over,
          cash_approved: s.cash_approved
        });
        
        groupedVerifications[key].cashSubmitted += s.cash_handed_over || 0;
        groupedVerifications[key].gcashSubmitted += s.gcash_handed_over || 0;
      });

      // Add related expenses and calculate totals
      Object.values(groupedVerifications).forEach(v => {
        v.expenses = (expenses || []).filter(e => e.date === v.date && e.shift === v.shift) as PendingExpense[];
        v.totalExpected = v.cashExpected + v.gcashExpected;
        v.totalSubmitted = v.cashSubmitted + v.gcashSubmitted;
        v.difference = v.totalSubmitted - v.totalExpected;
      });

      setPendingVerifications(Object.values(groupedVerifications));
      
      // Initialize shortage inputs
      const inputs: Record<string, Record<string, string>> = {};
      Object.values(groupedVerifications).forEach(v => {
        const key = `${v.date}-${v.shift}`;
        inputs[key] = {};
        if (v.difference < 0) {
          const shortagePerPerson = Math.abs(v.difference) / v.shifts.length;
          v.shifts.forEach(s => {
            inputs[key][s.id] = Math.round(shortagePerPerson).toString();
          });
        }
      });
      setShortageInputs(inputs);
      
    } catch (e) {
      console.error('Error loading pending data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPendingData(); }, []);

  const approveVerification = async (verification: PendingVerification, addToStorage: boolean) => {
    const key = `${verification.date}-${verification.shift}`;
    setProcessing(key);
    
    try {
      // Update all shifts as approved
      for (const shift of verification.shifts) {
        const shortage = verification.difference < 0 
          ? parseInt(shortageInputs[key]?.[shift.id] || '0') 
          : 0;
        
        await supabase
          .from('shifts')
          .update({ 
            cash_approved: true,
            cash_shortage: shortage
          })
          .eq('id', shift.id);
      }

      // Approve related expenses
      for (const expense of verification.expenses) {
        await supabase
          .from('cash_expenses')
          .update({ approved: true })
          .eq('id', expense.id);
      }

      // If surplus, add to cash_register.cash_actual
      if (addToStorage && verification.difference > 0) {
        const { data: existing } = await supabase
          .from('cash_register')
          .select('id, cash_actual, gcash_actual')
          .eq('date', verification.date)
          .eq('shift', verification.shift)
          .single();
        
        if (existing) {
          await supabase
            .from('cash_register')
            .update({
              cash_actual: (existing.cash_actual || 0) + verification.cashSubmitted,
              gcash_actual: (existing.gcash_actual || 0) + verification.gcashSubmitted
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('cash_register')
            .insert({
              date: verification.date,
              shift: verification.shift,
              cash_actual: verification.cashSubmitted,
              gcash_actual: verification.gcashSubmitted
            });
        }
      }

      toast.success('Approved successfully');
      loadPendingData();
    } catch (e) {
      console.error('Error approving:', e);
      toast.error('Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const rejectShift = async (shiftId: string) => {
    try {
      await supabase
        .from('shifts')
        .update({ 
          cash_handed_over: null,
          gcash_handed_over: null
        })
        .eq('id', shiftId);
      
      toast.success('Rejected - employee must resubmit');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to reject');
    }
  };

  const approveExpense = async (id: string) => {
    try {
      await supabase
        .from('cash_expenses')
        .update({ approved: true })
        .eq('id', id);
      toast.success('Expense approved');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to approve');
    }
  };

  const rejectExpense = async (id: string) => {
    try {
      await supabase
        .from('cash_expenses')
        .delete()
        .eq('id', id);
      toast.success('Expense rejected');
      loadPendingData();
    } catch (e) {
      toast.error('Failed to reject');
    }
  };

  const splitEqually = (verification: PendingVerification) => {
    if (verification.difference >= 0) return;
    const key = `${verification.date}-${verification.shift}`;
    const shortagePerPerson = Math.abs(verification.difference) / verification.shifts.length;
    const newInputs = { ...shortageInputs };
    newInputs[key] = {};
    verification.shifts.forEach(s => {
      newInputs[key][s.id] = Math.round(shortagePerPerson).toString();
    });
    setShortageInputs(newInputs);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const standalonePendingExpenses = pendingExpenses.filter(e => 
    !pendingVerifications.some(v => v.expenses.some(ve => ve.id === e.id))
  );

  if (pendingVerifications.length === 0 && standalonePendingExpenses.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
          <p>No pending approvals</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cash Handover Verifications */}
      {pendingVerifications.map(v => {
        const key = `${v.date}-${v.shift}`;
        const isSurplus = v.difference > 0;
        const isShortage = v.difference < 0;
        const isMatch = v.difference === 0;
        
        return (
          <Card key={key} className={cn(
            "border-2 transition-all",
            isSurplus && "border-green-500/50 bg-green-500/5",
            isShortage && "border-red-500/50 bg-red-500/5",
            isMatch && "border-blue-500/50 bg-blue-500/5"
          )}>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  {v.date} • {v.shift === 'day' ? '☀️ Day' : '🌙 Night'}
                </span>
                <Badge variant="outline" className={cn(
                  "font-bold",
                  isSurplus && "border-green-500 text-green-500",
                  isShortage && "border-red-500 text-red-500",
                  isMatch && "border-blue-500 text-blue-500"
                )}>
                  {isSurplus && <TrendingUp className="w-3 h-3 mr-1" />}
                  {isShortage && <TrendingDown className="w-3 h-3 mr-1" />}
                  {isMatch ? 'MATCH' : `${v.difference > 0 ? '+' : ''}₱${v.difference.toLocaleString()}`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Comparison */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-2 rounded-lg bg-background/80">
                  <p className="text-[10px] text-muted-foreground mb-1">Loyverse Expected</p>
                  <div className="flex items-center gap-2">
                    <Banknote className="w-3 h-3 text-green-500" />
                    <span>₱{v.cashExpected.toLocaleString()}</span>
                    <Smartphone className="w-3 h-3 text-blue-500 ml-2" />
                    <span>₱{v.gcashExpected.toLocaleString()}</span>
                  </div>
                  <p className="font-bold mt-1">Total: ₱{v.totalExpected.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded-lg bg-background/80">
                  <p className="text-[10px] text-muted-foreground mb-1">Staff Submitted</p>
                  <div className="flex items-center gap-2">
                    <Banknote className="w-3 h-3 text-green-500" />
                    <span>₱{v.cashSubmitted.toLocaleString()}</span>
                    <Smartphone className="w-3 h-3 text-blue-500 ml-2" />
                    <span>₱{v.gcashSubmitted.toLocaleString()}</span>
                  </div>
                  <p className="font-bold mt-1">Total: ₱{v.totalSubmitted.toLocaleString()}</p>
                </div>
              </div>

              {/* Employee submissions */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> Employee Submissions ({v.shifts.length})
                </p>
                {v.shifts.map(s => (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/60 text-sm">
                    <span className="flex-1 font-medium">{s.employee_name}</span>
                    <Badge variant="outline" className="text-green-600 border-green-500/30">
                      <Banknote className="w-3 h-3 mr-1" />
                      ₱{(s.cash_handed_over || 0).toLocaleString()}
                    </Badge>
                    <Badge variant="outline" className="text-blue-600 border-blue-500/30">
                      <Smartphone className="w-3 h-3 mr-1" />
                      ₱{(s.gcash_handed_over || 0).toLocaleString()}
                    </Badge>
                    {isShortage && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-500">Shortage:</span>
                        <Input
                          type="number"
                          className="w-20 h-7 text-xs text-center"
                          value={shortageInputs[key]?.[s.id] || '0'}
                          onChange={e => {
                            const newInputs = { ...shortageInputs };
                            if (!newInputs[key]) newInputs[key] = {};
                            newInputs[key][s.id] = e.target.value;
                            setShortageInputs(newInputs);
                          }}
                        />
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:bg-red-500/10"
                      onClick={() => rejectShift(s.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Related expenses */}
              {v.expenses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Related Expenses ({v.expenses.length})</p>
                  {v.expenses.map(exp => (
                    <div key={exp.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-sm">
                      <Badge variant="outline" className="text-xs">
                        {exp.payment_source === 'gcash' ? '📱' : '💵'}
                      </Badge>
                      <span className="flex-1">{getCategoryLabel(exp.category)}</span>
                      <span className="font-medium">₱{exp.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {isShortage && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => splitEqually(v)}
                  >
                    Split Equally
                  </Button>
                )}
                <Button
                  className={cn(
                    "flex-1",
                    isSurplus && "bg-green-500 hover:bg-green-600",
                    isShortage && "bg-red-500 hover:bg-red-600",
                    isMatch && "bg-blue-500 hover:bg-blue-600"
                  )}
                  onClick={() => approveVerification(v, true)}
                  disabled={processing === key}
                >
                  {processing === key ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {isSurplus && `Add +₱${v.difference.toLocaleString()} to Storage & Approve`}
                  {isShortage && `Assign Shortage & Approve`}
                  {isMatch && `Approve`}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Standalone Pending Expenses */}
      {standalonePendingExpenses.length > 0 && (
        <Card>
          <CardHeader className="py-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Pending Expenses ({standalonePendingExpenses.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {standalonePendingExpenses.map(exp => (
              <div key={exp.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm group">
                <Badge variant="outline" className="text-xs">
                  {exp.payment_source === 'gcash' ? '📱 GCash' : '💵 Cash'}
                </Badge>
                <span className="text-muted-foreground text-xs">{exp.date}</span>
                <span className="flex-1">{getCategoryLabel(exp.category)}</span>
                {exp.description && (
                  <span className="text-xs text-muted-foreground truncate max-w-24">{exp.description}</span>
                )}
                <span className="font-medium">₱{exp.amount.toLocaleString()}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-500 hover:bg-green-500/10"
                  onClick={() => approveExpense(exp.id)}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-500 hover:bg-red-500/10"
                  onClick={() => rejectExpense(exp.id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
