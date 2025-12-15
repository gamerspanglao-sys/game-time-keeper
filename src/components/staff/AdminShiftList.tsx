import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Pencil, Clock, Sun, Moon } from 'lucide-react';

interface ShiftWithEmployee {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  shift_start: string | null;
  shift_end: string | null;
  total_hours: number;
  base_salary: number;
  status: string;
  cash_handed_over: number | null;
}

export function AdminShiftList() {
  const [shifts, setShifts] = useState<ShiftWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState<ShiftWithEmployee | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadShifts();
  }, []);

  const loadShifts = async () => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select(`
          *,
          employees (name)
        `)
        .order('date', { ascending: false })
        .order('shift_start', { ascending: false })
        .limit(50);

      if (error) throw error;

      setShifts(
        (data || []).map((s: any) => ({
          ...s,
          employee_name: s.employees?.name || 'Unknown'
        }))
      );
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (shift: ShiftWithEmployee) => {
    setEditingShift(shift);
    setEditHours(shift.total_hours?.toString() || '');
    setEditSalary(shift.base_salary?.toString() || '500');
  };

  const saveShift = async () => {
    if (!editingShift) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          total_hours: parseFloat(editHours) || 0,
          base_salary: parseInt(editSalary) || 500
        })
        .eq('id', editingShift.id);

      if (error) throw error;

      toast.success('Shift updated');
      setEditingShift(null);
      loadShifts();
    } catch (error) {
      console.error('Error updating shift:', error);
      toast.error('Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Shifts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left py-2 px-3 font-semibold">Date</th>
                  <th className="text-left py-2 px-3 font-semibold">Employee</th>
                  <th className="text-left py-2 px-3 font-semibold">Time</th>
                  <th className="text-right py-2 px-3 font-semibold">Hours</th>
                  <th className="text-right py-2 px-3 font-semibold">Salary</th>
                  <th className="text-left py-2 px-3 font-semibold">Status</th>
                  <th className="py-2 px-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 px-3 whitespace-nowrap">{shift.date}</td>
                    <td className="py-2 px-3 font-medium">{shift.employee_name}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {shift.shift_start ? format(new Date(shift.shift_start), 'HH:mm') : '—'}
                      {shift.shift_end && ` → ${format(new Date(shift.shift_end), 'HH:mm')}`}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      {shift.total_hours?.toFixed(1) || '—'}h
                    </td>
                    <td className="text-right py-2 px-3">₱{shift.base_salary}</td>
                    <td className="py-2 px-3">
                      <Badge variant={shift.status === 'open' ? 'default' : 'secondary'}>
                        {shift.status === 'open' ? (
                          <><Sun className="w-3 h-3 mr-1" /> Active</>
                        ) : (
                          <><Moon className="w-3 h-3 mr-1" /> Closed</>
                        )}
                      </Badge>
                    </td>
                    <td className="py-2 px-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(shift)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Shift Dialog */}
      <Dialog open={!!editingShift} onOpenChange={() => setEditingShift(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" />
              Edit Shift
            </DialogTitle>
          </DialogHeader>
          {editingShift && (
            <div className="space-y-4 pt-2">
              <div className="bg-secondary/50 p-3 rounded-lg">
                <div className="font-medium">{editingShift.employee_name}</div>
                <div className="text-sm text-muted-foreground">
                  {editingShift.date} • {editingShift.shift_start ? format(new Date(editingShift.shift_start), 'HH:mm') : '—'}
                  {editingShift.shift_end && ` → ${format(new Date(editingShift.shift_end), 'HH:mm')}`}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Hours</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editHours}
                    onChange={(e) => setEditHours(e.target.value)}
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
              
              <Button onClick={saveShift} className="w-full" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
