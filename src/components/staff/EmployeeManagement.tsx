import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Users, Plus, Pencil, Loader2 } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  position: string;
  telegram_id: string | null;
  active: boolean;
}

export function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [position, setPosition] = useState('Staff');
  const [telegramId, setTelegramId] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingEmployee(null);
    setName('');
    setPosition('Staff');
    setTelegramId('');
    setActive(true);
    setShowDialog(true);
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setName(employee.name);
    setPosition(employee.position);
    setTelegramId(employee.telegram_id || '');
    setActive(employee.active);
    setShowDialog(true);
  };

  const saveEmployee = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update({
            name: name.trim(),
            position: position.trim(),
            telegram_id: telegramId.trim() || null,
            active
          })
          .eq('id', editingEmployee.id);

        if (error) throw error;
        toast.success('Employee updated');
      } else {
        const { error } = await supabase
          .from('employees')
          .insert({
            name: name.trim(),
            position: position.trim(),
            telegram_id: telegramId.trim() || null,
            active
          });

        if (error) throw error;
        toast.success('Employee added');
      }

      setShowDialog(false);
      loadEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (employee: Employee) => {
    try {
      const { error } = await supabase
        .from('employees')
        .update({ active: !employee.active })
        .eq('id', employee.id);

      if (error) throw error;
      
      setEmployees(employees.map(e => 
        e.id === employee.id ? { ...e, active: !e.active } : e
      ));
      toast.success(employee.active ? 'Employee deactivated' : 'Employee activated');
    } catch (error) {
      console.error('Error toggling employee:', error);
      toast.error('Failed to update');
    }
  };

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Employees ({employees.length})
        </h3>
        <Button onClick={openAddDialog} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <div className="grid gap-3">
        {employees.map((employee) => (
          <Card key={employee.id} className={!employee.active ? 'opacity-50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{employee.name}</div>
                  <div className="text-sm text-muted-foreground">{employee.position}</div>
                  {employee.telegram_id && (
                    <div className="text-xs text-muted-foreground">TG: {employee.telegram_id}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={employee.active ? 'default' : 'secondary'}>
                    {employee.active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => openEditDialog(employee)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {employees.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No employees yet. Add your first employee.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? 'Edit Employee' : 'Add Employee'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Name *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Employee name"
                className="mt-2"
                autoFocus
              />
            </div>
            <div>
              <Label>Position</Label>
              <Input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Staff"
                className="mt-2"
              />
            </div>
            <div>
              <Label>Telegram ID (optional)</Label>
              <Input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder="@username or ID"
                className="mt-2"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
            <Button 
              onClick={saveEmployee} 
              className="w-full"
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingEmployee ? 'Update' : 'Add'} Employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
