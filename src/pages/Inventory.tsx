import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Loader2, Package, Download, RefreshCw, Plus, Check, X, Search, Truck, Edit2
} from 'lucide-react';

interface InventoryItem {
  item_id: string;
  item_name: string;
  in_stock: number;
  cost: number;
  total_value: number;
  category?: string;
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showZeroStock, setShowZeroStock] = useState(false);
  
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Receipt dialog
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptItem, setReceiptItem] = useState('');
  const [receiptQty, setReceiptQty] = useState('');
  const [receiptCost, setReceiptCost] = useState('');
  const [receiptNotes, setReceiptNotes] = useState('');

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
          .sort((a: InventoryItem, b: InventoryItem) => b.in_stock - a.in_stock); // Sort by stock descending
        
        setItems(inventoryItems);
        toast.success(`Loaded ${inventoryItems.length} items`);
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('Error loading inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const filteredItems = items
    .filter(item => showZeroStock || item.in_stock > 0)
    .filter(item => item.item_name.toLowerCase().includes(searchTerm.toLowerCase()));

  const itemsInStock = items.filter(i => i.in_stock > 0);
  const totalValue = itemsInStock.reduce((sum, item) => sum + item.total_value, 0);
  const totalQty = itemsInStock.reduce((sum, item) => sum + item.in_stock, 0);

  // Start editing
  const startEdit = (item: InventoryItem) => {
    setEditingId(item.item_id);
    setEditValue(item.in_stock.toString());
  };

  // Save inventory check
  const saveEdit = async (item: InventoryItem) => {
    const actualQty = parseInt(editValue);
    if (isNaN(actualQty) || actualQty < 0) {
      toast.error('Enter valid quantity');
      return;
    }

    const diff = actualQty - item.in_stock;

    try {
      await supabase.from('inventory_logs').insert({
        action_type: diff === 0 ? 'inventory_check' : 'adjustment',
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: actualQty,
        previous_quantity: item.in_stock,
        cost_per_unit: item.cost,
        total_cost: Math.abs(diff) * item.cost,
        notes: diff === 0 ? 'Match' : `Discrepancy: ${diff > 0 ? '+' : ''}${diff}`
      });

      await supabase.from('activity_log').insert({
        timer_id: item.item_id,
        timer_name: item.item_name,
        action: diff === 0 ? 'inventory_ok' : 'inventory_diff',
        timestamp: Date.now()
      });

      if (diff === 0) {
        toast.success(`✓ ${item.item_name}: match`);
      } else {
        toast.warning(`${item.item_name}: ${diff > 0 ? '+' : ''}${diff}`);
      }

      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving check:', error);
      toast.error('Error');
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Add stock receipt
  const addReceipt = async () => {
    const qty = parseInt(receiptQty);
    const cost = parseInt(receiptCost) || 0;
    
    if (!receiptItem || !qty || qty <= 0) {
      toast.error('Select item and quantity');
      return;
    }

    const selectedItem = items.find(i => i.item_id === receiptItem);
    if (!selectedItem) return;

    try {
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

      await supabase.from('activity_log').insert({
        timer_id: selectedItem.item_id,
        timer_name: selectedItem.item_name,
        action: 'receipt',
        timestamp: Date.now()
      });

      toast.success(`Receipt: ${selectedItem.item_name} +${qty} pcs`);
      setShowReceiptDialog(false);
      setReceiptItem('');
      setReceiptQty('');
      setReceiptCost('');
      setReceiptNotes('');
    } catch (error) {
      console.error('Error adding receipt:', error);
      toast.error('Error');
    }
  };

  const exportToExcel = () => {
    const rows: any[] = [
      ['INVENTORY', format(new Date(), 'dd.MM.yyyy HH:mm')],
      ['Item', 'Quantity', 'Cost', 'Total'],
    ];

    itemsInStock.forEach(item => {
      rows.push([item.item_name, item.in_stock, item.cost, item.total_value]);
    });

    rows.push([]);
    rows.push(['TOTAL', totalQty, '', totalValue]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Export complete');
  };

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          Inventory
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowReceiptDialog(true)}>
            <Truck className="w-4 h-4 mr-1" />
            Receipt
          </Button>
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
            <div className="text-xs text-blue-600 font-medium">Items in Stock</div>
            <div className="text-2xl font-bold">{itemsInStock.length}</div>
            <div className="text-xs text-muted-foreground">{totalQty.toLocaleString()} pcs</div>
          </CardContent>
        </Card>
        <Card className="bg-green-500/10 border-green-500/30">
          <CardContent className="py-3 px-4">
            <div className="text-xs text-green-600 font-medium">Total Value</div>
            <div className="text-2xl font-bold">₱{totalValue.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showZeroStock} onCheckedChange={setShowZeroStock} />
          <span className="text-muted-foreground whitespace-nowrap">Show zero</span>
        </div>
      </div>

      {/* Stock List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No items found</div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="bg-muted/30">
                    <th className="text-left py-2 px-3 font-medium">Item</th>
                    <th className="text-right py-2 px-3 font-medium w-24">Qty</th>
                    <th className="text-right py-2 px-3 font-medium w-24">Value</th>
                    <th className="py-2 px-2 w-16"></th>
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
                        {editingId === item.item_id ? (
                          <Input
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-20 h-7 text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(item);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                        ) : (
                          <Badge variant={item.in_stock > 0 ? "secondary" : "destructive"}>
                            {item.in_stock}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        ₱{item.total_value.toLocaleString()}
                      </td>
                      <td className="py-2 px-2">
                        {editingId === item.item_id ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => saveEdit(item)}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={cancelEdit}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stock Receipt</DialogTitle>
            <DialogDescription>Add incoming stock</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Item</label>
              <Select value={receiptItem} onValueChange={setReceiptItem}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {items.map(item => (
                    <SelectItem key={item.item_id} value={item.item_id}>
                      {item.item_name} ({item.in_stock} pcs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Quantity</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={receiptQty}
                  onChange={(e) => setReceiptQty(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Unit Cost</label>
                <Input
                  type="number"
                  placeholder="₱0"
                  value={receiptCost}
                  onChange={(e) => setReceiptCost(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input
                placeholder="Supplier, invoice..."
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
              />
            </div>
            <Button onClick={addReceipt} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
