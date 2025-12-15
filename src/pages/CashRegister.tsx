import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  RefreshCw,
  Lock,
  Wallet,
  Loader2,
  Sun,
  Moon,
  Pencil
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ============= TYPES =============

type ShiftType = 'day' | 'night';

interface CashRecord {
  id: string;
  date: string;
  shift: ShiftType;
  opening_balance: number;
  expected_sales: number;
  cash_expected: number | null;
  gcash_expected: number | null;
  cost: number;
  actual_cash: number | null;
  cash_actual: number | null;
  gcash_actual: number | null;
  discrepancy: number | null;
  purchases: number;
  salaries: number;
  other_expenses: number;
  notes: string | null;
}

interface ShiftHandover {
  employee_name: string;
  cash_handed_over: number | null;
  gcash_handed_over: number | null;
}

// ============= CONSTANTS =============

const ADMIN_PIN = '8808';

// Get current shift based on Manila time
const getCurrentShift = (): ShiftType => {
  const now = new Date();
  const manilaOffset = 8 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const manilaTime = new Date(utcTime + (manilaOffset * 60000));
  const hour = manilaTime.getHours();
  return hour >= 5 && hour < 17 ? 'day' : 'night';
};

// Get current date for the shift
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

export default function CashRegister() {
  const [records, setRecords] = useState<CashRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentShiftHandovers, setCurrentShiftHandovers] = useState<ShiftHandover[]>([]);
  
  // Admin mode
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  
  // Edit dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CashRecord | null>(null);
  const [editCashActual, setEditCashActual] = useState('');
  const [editGcashActual, setEditGcashActual] = useState('');

  // Selected shift for viewing
  const [selectedDate, setSelectedDate] = useState<string>(getShiftDate());
  const [selectedShift, setSelectedShift] = useState<ShiftType>(getCurrentShift());

  // Calculate totals
  const totalEmployeeCash = currentShiftHandovers.reduce((sum, h) => sum + (h.cash_handed_over || 0), 0);
  const totalEmployeeGcash = currentShiftHandovers.reduce((sum, h) => sum + (h.gcash_handed_over || 0), 0);

  // Load data
  const loadData = async () => {
    try {
      const { data, error } = await supabase
        .from('cash_register')
        .select('*')
        .order('date', { ascending: false })
        .order('shift', { ascending: true });

      if (error) throw error;
      setRecords((data || []) as CashRecord[]);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentShiftHandovers = async () => {
    const shiftTypeFilter = selectedShift === 'day' ? 'Day (5AM-5PM)' : 'Night (5PM-5AM)';
    
    const { data } = await supabase
      .from('shifts')
      .select(`
        cash_handed_over,
        gcash_handed_over,
        employees!inner(name)
      `)
      .eq('date', selectedDate)
      .eq('shift_type', shiftTypeFilter)
      .not('cash_handed_over', 'is', null);
    
    if (data) {
      const handovers: ShiftHandover[] = data.map((s: any) => ({
        employee_name: s.employees?.name || 'Unknown',
        cash_handed_over: s.cash_handed_over,
        gcash_handed_over: s.gcash_handed_over || 0
      }));
      setCurrentShiftHandovers(handovers);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadCurrentShiftHandovers();
  }, [selectedDate, selectedShift]);

  useEffect(() => {
    const channel = supabase
      .channel('cash-register-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_register' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        loadCurrentShiftHandovers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, selectedShift]);

  const handleAdminLogin = () => {
    if (pinInput === ADMIN_PIN) {
      setIsAdminMode(true);
      setShowPinDialog(false);
      setPinInput('');
      setPinError('');
    } else {
      setPinError('Wrong PIN');
    }
  };

  const syncFromLoyverse = async () => {
    setSyncing(true);
    try {
      toast.info('Syncing sales data from Loyverse...');
      
      const { data, error } = await supabase.functions.invoke('loyverse-history-sync', {
        body: { days: 7 }
      });

      if (error) throw error;

      if (data?.success) {
        await loadData();
        toast.success(`Synced ${data.message}`);
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing from Loyverse:', error);
      toast.error('Failed to sync from Loyverse');
    } finally {
      setSyncing(false);
    }
  };

  const openEditDialog = (record: CashRecord) => {
    setEditingRecord(record);
    setEditCashActual(record.cash_actual?.toString() || '');
    setEditGcashActual(record.gcash_actual?.toString() || '');
    setShowEditDialog(true);
  };

  const saveEdit = async () => {
    if (!editingRecord) return;
    
    const cashActual = parseInt(editCashActual) || 0;
    const gcashActual = parseInt(editGcashActual) || 0;
    const totalActual = cashActual + gcashActual;
    const expectedTotal = (editingRecord.cash_expected || 0) + (editingRecord.gcash_expected || 0);
    const discrepancy = totalActual - expectedTotal;
    
    try {
      const { error } = await supabase
        .from('cash_register')
        .update({
          cash_actual: cashActual,
          gcash_actual: gcashActual,
          actual_cash: totalActual,
          discrepancy
        })
        .eq('id', editingRecord.id);

      if (error) throw error;
      
      toast.success('Updated successfully');
      setShowEditDialog(false);
      loadData();
    } catch (error) {
      console.error('Error updating:', error);
      toast.error('Failed to update');
    }
  };

  // Get current shift record
  const currentRecord = records.find(r => r.date === selectedDate && r.shift === selectedShift);

  // Get recent records (last 7 days)
  const recentRecords = records.slice(0, 14);

  // Get unique dates for selector
  const uniqueDates = [...new Set(records.map(r => r.date))].slice(0, 7);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash Register</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncFromLoyverse}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Sync</span>
          </Button>
          {!isAdminMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPinDialog(true)}
            >
              <Lock className="w-4 h-4" />
              <span className="ml-2 hidden sm:inline">Admin</span>
            </Button>
          )}
        </div>
      </div>

      {/* Shift Selector */}
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-2 items-center">
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {uniqueDates.map(date => (
                  <SelectItem key={date} value={date}>{date}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md overflow-hidden">
              <Button
                variant={selectedShift === 'day' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('day')}
              >
                <Sun className="w-4 h-4 mr-1" /> Day
              </Button>
              <Button
                variant={selectedShift === 'night' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none"
                onClick={() => setSelectedShift('night')}
              >
                <Moon className="w-4 h-4 mr-1" /> Night
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Verification Tracker */}
      {currentRecord && (
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {selectedShift === 'day' ? '☀️ Day' : '🌙 Night'} {selectedDate}
                </Badge>
                <span className="text-muted-foreground">Cash Verification</span>
              </div>
              {isAdminMode && (
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(currentRecord)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Section 1: Expected from Loyverse */}
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="text-[10px] text-green-600 uppercase tracking-wider font-semibold mb-2">
                📊 Loyverse Expected (POS)
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground">💵 Cash</div>
                  <div className="font-bold text-lg text-green-600">₱{(currentRecord.cash_expected || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">📱 GCash</div>
                  <div className="font-bold text-lg text-green-600">₱{(currentRecord.gcash_expected || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">💰 Total</div>
                  <div className="font-bold text-lg text-green-600">₱{((currentRecord.cash_expected || 0) + (currentRecord.gcash_expected || 0)).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* Section 2: Admin Received */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="text-[10px] text-blue-600 uppercase tracking-wider font-semibold mb-2">
                ✅ Admin Received (Actual)
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground">💵 Cash</div>
                  <div className={cn("font-bold text-lg", (currentRecord.cash_actual || 0) > 0 ? "text-blue-600" : "text-muted-foreground")}>
                    {(currentRecord.cash_actual || 0) > 0 ? `₱${currentRecord.cash_actual?.toLocaleString()}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">📱 GCash</div>
                  <div className={cn("font-bold text-lg", (currentRecord.gcash_actual || 0) > 0 ? "text-blue-600" : "text-muted-foreground")}>
                    {(currentRecord.gcash_actual || 0) > 0 ? `₱${currentRecord.gcash_actual?.toLocaleString()}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">💰 Total</div>
                  <div className={cn("font-bold text-lg", ((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) > 0 ? "text-blue-600" : "text-muted-foreground")}>
                    {((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) > 0 
                      ? `₱${((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)).toLocaleString()}` 
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Difference */}
            {((currentRecord.cash_actual || 0) + (currentRecord.gcash_actual || 0)) > 0 && (
              <div className={cn(
                "p-3 rounded-lg border",
                (currentRecord.discrepancy || 0) >= 0 
                  ? "bg-green-500/10 border-green-500/20" 
                  : "bg-red-500/10 border-red-500/20"
              )}>
                <div className={cn(
                  "text-[10px] uppercase tracking-wider font-semibold mb-2",
                  (currentRecord.discrepancy || 0) >= 0 ? "text-green-600" : "text-red-600"
                )}>
                  📈 Difference (Actual - Expected)
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-muted-foreground">💵 Cash</div>
                    <div className={cn(
                      "font-bold text-lg",
                      ((currentRecord.cash_actual || 0) - (currentRecord.cash_expected || 0)) >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {((currentRecord.cash_actual || 0) - (currentRecord.cash_expected || 0)) >= 0 ? '+' : ''}₱{((currentRecord.cash_actual || 0) - (currentRecord.cash_expected || 0)).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">📱 GCash</div>
                    <div className={cn(
                      "font-bold text-lg",
                      ((currentRecord.gcash_actual || 0) - (currentRecord.gcash_expected || 0)) >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {((currentRecord.gcash_actual || 0) - (currentRecord.gcash_expected || 0)) >= 0 ? '+' : ''}₱{((currentRecord.gcash_actual || 0) - (currentRecord.gcash_expected || 0)).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">💰 Total</div>
                    <div className={cn(
                      "font-bold text-lg",
                      (currentRecord.discrepancy || 0) >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      {(currentRecord.discrepancy || 0) >= 0 ? '+' : ''}₱{(currentRecord.discrepancy || 0).toLocaleString()}
                      <span className="text-xs ml-1">
                        {(currentRecord.discrepancy || 0) > 0 ? 'OVER' : (currentRecord.discrepancy || 0) < 0 ? 'SHORT' : '✓'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Staff Handovers */}
            {currentShiftHandovers.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  👥 Staff Handovers
                </div>
                <div className="space-y-1">
                  {currentShiftHandovers.map((h, i) => (
                    <div key={i} className="flex justify-between text-xs bg-secondary/30 p-2 rounded">
                      <span className="font-medium">{h.employee_name}</span>
                      <span>
                        💵 ₱{(h.cash_handed_over || 0).toLocaleString()}
                        {(h.gcash_handed_over || 0) > 0 && (
                          <span className="ml-2">📱 ₱{h.gcash_handed_over?.toLocaleString()}</span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold pt-1 border-t">
                    <span>Total from Staff</span>
                    <span>
                      💵 ₱{totalEmployeeCash.toLocaleString()}
                      {totalEmployeeGcash > 0 && (
                        <span className="ml-2">📱 ₱{totalEmployeeGcash.toLocaleString()}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!currentRecord && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            No data for {selectedDate} {selectedShift} shift. Click Sync to fetch from Loyverse.
          </CardContent>
        </Card>
      )}

      {/* Recent History */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Recent History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Shift</th>
                  <th className="text-right py-2 px-2">Expected</th>
                  <th className="text-right py-2 px-2">Cash</th>
                  <th className="text-right py-2 px-2">GCash</th>
                  <th className="text-right py-2 px-2">Actual</th>
                  <th className="text-right py-2 px-2">Diff</th>
                  {isAdminMode && <th className="py-2 px-2 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => {
                  const expectedTotal = (record.cash_expected || 0) + (record.gcash_expected || 0);
                  const actualTotal = (record.cash_actual || 0) + (record.gcash_actual || 0);
                  const diff = actualTotal - expectedTotal;
                  return (
                    <tr 
                      key={record.id} 
                      className={cn(
                        "border-b hover:bg-muted/50 cursor-pointer",
                        record.date === selectedDate && record.shift === selectedShift && "bg-primary/10"
                      )}
                      onClick={() => {
                        setSelectedDate(record.date);
                        setSelectedShift(record.shift);
                      }}
                    >
                      <td className="py-2 px-2 whitespace-nowrap">{record.date}</td>
                      <td className="py-2 px-2">
                        <Badge variant={record.shift === 'day' ? 'default' : 'secondary'} className="text-xs">
                          {record.shift === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
                        </Badge>
                      </td>
                      <td className="text-right py-2 px-2 text-green-600">₱{expectedTotal.toLocaleString()}</td>
                      <td className="text-right py-2 px-2">₱{(record.cash_expected || 0).toLocaleString()}</td>
                      <td className="text-right py-2 px-2">₱{(record.gcash_expected || 0).toLocaleString()}</td>
                      <td className="text-right py-2 px-2 text-blue-600">
                        {actualTotal > 0 ? `₱${actualTotal.toLocaleString()}` : '—'}
                      </td>
                      <td className={cn(
                        "text-right py-2 px-2 font-medium",
                        actualTotal === 0 ? "text-muted-foreground" :
                        diff === 0 ? "text-green-600" :
                        diff > 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {actualTotal === 0 ? '—' : (
                          diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}₱${diff.toLocaleString()}`
                        )}
                      </td>
                      {isAdminMode && (
                        <td className="py-2 px-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(record);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PIN Dialog */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Admin Access</DialogTitle>
            <DialogDescription>Enter PIN to access admin features</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Enter PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
            />
            {pinError && <p className="text-sm text-red-500">{pinError}</p>}
            <Button onClick={handleAdminLogin} className="w-full">Login</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Cash Received</DialogTitle>
            <DialogDescription>
              {editingRecord?.date} {editingRecord?.shift === 'day' ? '☀️ Day' : '🌙 Night'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">Expected Cash: ₱{(editingRecord?.cash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <Wallet className="w-4 h-4 text-green-600" />
                <Input
                  type="number"
                  placeholder="Cash Actual"
                  value={editCashActual}
                  onChange={(e) => setEditCashActual(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Expected GCash: ₱{(editingRecord?.gcash_expected || 0).toLocaleString()}</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-blue-600">📱</span>
                <Input
                  type="number"
                  placeholder="GCash Actual"
                  value={editGcashActual}
                  onChange={(e) => setEditGcashActual(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={saveEdit} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}