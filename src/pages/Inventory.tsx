import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Loader2, Package, Download, RefreshCw, DollarSign, Plus, ClipboardCheck, 
  History, Truck, Search, AlertTriangle
} from 'lucide-react';

interface InventoryItem {
  item_id: string;
  item_name: string;
  in_stock: number;
  cost: number;
  total_value: number;
  category?: string;
}

interface InventoryLog {
  id: string;
  action_type: 'receipt' | 'inventory_check' | 'adjustment';
  item_id: string;
  item_name: string;
  quantity: number;
  previous_quantity: number | null;
  cost_per_unit: number;
  total_cost: number;
  notes: string | null;
  created_at: string;
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('stock');

  // Receipt dialog
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptItem, setReceiptItem] = useState('');
  const [receiptQty, setReceiptQty] = useState('');
  const [receiptCost, setReceiptCost] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');

  // Inventory check dialog
  const [showCheckDialog, setShowCheckDialog] = useState(false);
  const [checkItem, setCheckItem] = useState<InventoryItem | null>(null);
  const [checkActualQty, setCheckActualQty] = useState('');
  const [checkNotes, setCheckNotes] = useState('');

  const loadInventory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-sync', {
        body: { action: 'inventory' }
      });

      if (error) throw error;
      
      if (data?.inventory) {
        const inventoryItems: InventoryItem[] = data.inventory
          .map((item: any) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            in_stock: item.in_stock || 0,
            cost: item.cost || 0,
            total_value: (item.in_stock || 0) * (item.cost || 0),
            category: item.category_name
          }))
          .sort((a: InventoryItem, b: InventoryItem) => a.item_name.localeCompare(b.item_name));
        
        setItems(inventoryItems);
        toast.success(`Загружено ${inventoryItems.length} позиций`);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Ошибка загрузки инвентаря');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setLogs((data || []) as InventoryLog[]);
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  useEffect(() => {
    loadInventory();
    loadLogs();
  }, []);

  useEffect(() => {
    const channel = supabase.channel('inventory-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_logs' }, loadLogs)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const itemsInStock = items.filter(i => i.in_stock > 0);
  const totalValue = itemsInStock.reduce((sum, item) => sum + item.total_value, 0);
  const totalQty = itemsInStock.reduce((sum, item) => sum + item.in_stock, 0);

  // Add stock receipt
  const addReceipt = async () => {
    const qty = parseInt(receiptQty);
    const cost = parseInt(receiptCost) || 0;
    
    if (!receiptItem || !qty || qty <= 0) {
      toast.error('Выберите товар и количество');
      return;
    }

    const selectedItem = items.find(i => i.item_id === receiptItem);
    if (!selectedItem) return;

    try {
      // Log to inventory_logs
      await supabase.from('inventory_logs').insert({
        action_type: 'receipt',
        item_id: selectedItem.item_id,
        item_name: selectedItem.item_name,
        quantity: qty,
        previous_quantity: selectedItem.in_stock,
        cost_per_unit: cost,
        total_cost: qty * cost,
        notes: receiptNotes || null
      });

      // Log to activity_log
      await supabase.from('activity_log').insert({
        timer_id: selectedItem.item_id,
        timer_name: selectedItem.item_name,
        action: 'receipt',
        timestamp: Date.now()
      });

      toast.success(`Приход: ${selectedItem.item_name} +${qty} шт.`);
      setShowReceiptDialog(false);
      setReceiptItem('');
      setReceiptQty('');
      setReceiptCost('');
      setReceiptNotes('');
      loadLogs();
    } catch (error) {
      console.error('Error adding receipt:', error);
      toast.error('Ошибка');
    }
  };

  // Run inventory check
  const runInventoryCheck = async () => {
    if (!checkItem) return;
    
    const actualQty = parseInt(checkActualQty);
    if (isNaN(actualQty) || actualQty < 0) {
      toast.error('Введите фактическое количество');
      return;
    }

    const diff = actualQty - checkItem.in_stock;

    try {
      // Log to inventory_logs
      await supabase.from('inventory_logs').insert({
        action_type: diff === 0 ? 'inventory_check' : 'adjustment',
        item_id: checkItem.item_id,
        item_name: checkItem.item_name,
        quantity: actualQty,
        previous_quantity: checkItem.in_stock,
        cost_per_unit: checkItem.cost,
        total_cost: Math.abs(diff) * checkItem.cost,
        notes: checkNotes || (diff === 0 ? 'Совпадает' : `Расхождение: ${diff > 0 ? '+' : ''}${diff}`)
      });

      // Log to activity_log
      await supabase.from('activity_log').insert({
        timer_id: checkItem.item_id,
        timer_name: checkItem.item_name,
        action: diff === 0 ? 'inventory_ok' : 'inventory_diff',
        timestamp: Date.now()
      });

      if (diff === 0) {
        toast.success(`✓ ${checkItem.item_name}: совпадает`);
      } else {
        toast.warning(`${checkItem.item_name}: расхождение ${diff > 0 ? '+' : ''}${diff}`);
      }

      setShowCheckDialog(false);
      setCheckItem(null);
      setCheckActualQty('');
      setCheckNotes('');
      loadLogs();
    } catch (error) {
      console.error('Error running check:', error);
      toast.error('Ошибка');
    }
  };

  const openCheckDialog = (item: InventoryItem) => {
    setCheckItem(item);
    setCheckActualQty(item.in_stock.toString());
    setShowCheckDialog(true);
  };

  const exportToExcel = () => {
    const rows: any[] = [
      ['ОСТАТКИ НА СКЛАДЕ', format(new Date(), 'dd.MM.yyyy HH:mm')],
      ['Позиция', 'Количество', 'Себестоимость', 'Сумма'],
    ];

    itemsInStock.forEach(item => {
      rows.push([item.item_name, item.in_stock, item.cost, item.total_value]);
    });

    rows.push([]);
    rows.push(['ИТОГО', totalQty, '', totalValue]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Остатки');
    XLSX.writeFile(wb, `inventory_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Экспорт завершен');
  };

  const getActionLabel = (type: string) => {
    switch(type) {
      case 'receipt': return { label: 'Приход', color: 'bg-green-500/20 text-green-600' };
      case 'inventory_check': return { label: 'Инвентаризация ✓', color: 'bg-blue-500/20 text-blue-600' };
      case 'adjustment': return { label: 'Корректировка', color: 'bg-amber-500/20 text-amber-600' };
      default: return { label: type, color: 'bg-muted text-muted-foreground' };
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          Склад
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadInventory} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-blue-600 font-medium">Позиций в наличии</div>
            <div className="text-2xl font-bold">{itemsInStock.length}</div>
            <div className="text-xs text-muted-foreground">{totalQty.toLocaleString()} шт.</div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-green-600 font-medium">Стоимость</div>
            <div className="text-2xl font-bold">₱{totalValue.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">по себестоимости</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setShowReceiptDialog(true)}>
          <Truck className="w-4 h-4 mr-2" />
          Приход товара
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setActiveTab('logs')}>
          <History className="w-4 h-4 mr-2" />
          История
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="stock">Остатки</TabsTrigger>
          <TabsTrigger value="logs">История операций</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск товара..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Stock Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Ничего не найдено</div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr className="bg-muted/30">
                        <th className="text-left py-2 px-3 font-medium">Товар</th>
                        <th className="text-right py-2 px-3 font-medium">Кол-во</th>
                        <th className="text-right py-2 px-3 font-medium">Сумма</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item) => (
                        <tr key={item.item_id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3">
                            <div className="font-medium">{item.item_name}</div>
                            {item.category && <div className="text-xs text-muted-foreground">{item.category}</div>}
                          </td>
                          <td className="text-right py-2 px-3">
                            <Badge variant={item.in_stock > 0 ? "secondary" : "destructive"}>
                              {item.in_stock}
                            </Badge>
                          </td>
                          <td className="text-right py-2 px-3 text-muted-foreground">
                            ₱{item.total_value.toLocaleString()}
                          </td>
                          <td className="py-2 px-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7"
                              onClick={() => openCheckDialog(item)}
                              title="Инвентаризация"
                            >
                              <ClipboardCheck className="w-4 h-4" />
                            </Button>
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

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">История операций</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Нет записей</div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto divide-y">
                  {logs.map((log) => {
                    const action = getActionLabel(log.action_type);
                    return (
                      <div key={log.id} className="p-3 hover:bg-muted/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{log.item_name}</span>
                          <Badge className={cn("text-xs", action.color)}>{action.label}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{format(new Date(log.created_at), 'dd.MM.yyyy HH:mm')}</span>
                          <span>
                            {log.action_type === 'receipt' && `+${log.quantity} шт.`}
                            {log.action_type === 'inventory_check' && `${log.quantity} шт.`}
                            {log.action_type === 'adjustment' && (
                              <span className={log.quantity > (log.previous_quantity || 0) ? "text-green-600" : "text-red-600"}>
                                {log.previous_quantity} → {log.quantity}
                              </span>
                            )}
                            {log.total_cost > 0 && ` (₱${log.total_cost.toLocaleString()})`}
                          </span>
                        </div>
                        {log.notes && <div className="text-xs text-muted-foreground mt-1">{log.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Приход товара</DialogTitle>
            <DialogDescription>Добавить поступление на склад</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Товар</label>
              <Select value={receiptItem} onValueChange={setReceiptItem}>
                <SelectTrigger><SelectValue placeholder="Выберите товар" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {items.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.item_name} ({item.in_stock} шт.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Количество</label>
                <Input type="number" placeholder="0" value={receiptQty} onChange={e => setReceiptQty(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Цена за шт.</label>
                <Input type="number" placeholder="0" value={receiptCost} onChange={e => setReceiptCost(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Примечание</label>
              <Input placeholder="Поставщик, накладная..." value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} />
            </div>
            <Button onClick={addReceipt} className="w-full">
              <Plus className="w-4 h-4 mr-2" />Добавить приход
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inventory Check Dialog */}
      <Dialog open={showCheckDialog} onOpenChange={setShowCheckDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Инвентаризация</DialogTitle>
            <DialogDescription>{checkItem?.item_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-xs text-muted-foreground">В системе</div>
              <div className="text-2xl font-bold">{checkItem?.in_stock} шт.</div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Фактическое количество</label>
              <Input 
                type="number" 
                value={checkActualQty} 
                onChange={e => setCheckActualQty(e.target.value)}
                className="text-lg"
              />
            </div>
            {checkItem && checkActualQty && parseInt(checkActualQty) !== checkItem.in_stock && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div>
                  <div className="text-sm font-medium text-amber-600">Расхождение</div>
                  <div className="text-xs text-muted-foreground">
                    {parseInt(checkActualQty) - checkItem.in_stock > 0 ? '+' : ''}
                    {parseInt(checkActualQty) - checkItem.in_stock} шт.
                  </div>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Примечание</label>
              <Input placeholder="Комментарий..." value={checkNotes} onChange={e => setCheckNotes(e.target.value)} />
            </div>
            <Button onClick={runInventoryCheck} className="w-full">
              <ClipboardCheck className="w-4 h-4 mr-2" />Подтвердить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
