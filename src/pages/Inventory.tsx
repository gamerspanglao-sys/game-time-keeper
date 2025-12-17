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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  Loader2, Package, Download, RefreshCw, Plus, Check, X, Search, Truck, Edit2, Send, ShoppingCart, AlertTriangle
} from 'lucide-react';

interface InventoryItem {
  item_id: string;
  item_name: string;
  in_stock: number;
  cost: number;
  total_value: number;
  category?: string;
}

interface SalesItem {
  name: string;
  totalQuantity: number;
  avgPerDay: number;
  recommendedQty: number;
  inStock: number;
  toOrder: number;
  caseSize: number;
  casesToOrder: number;
  category: string;
  supplier: string;
  note?: string;
}

interface PurchaseData {
  recommendations: SalesItem[];
  analysisDays: number;
  bufferDays: number;
  analysisPeriod: { start: string; end: string };
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

  // Purchase Order state
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [showOnlyToOrder, setShowOnlyToOrder] = useState(true);
  const [excludedItems, setExcludedItems] = useState<Set<string>>(new Set());
  const [sendingTelegram, setSendingTelegram] = useState(false);

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
          .sort((a: InventoryItem, b: InventoryItem) => b.in_stock - a.in_stock);
        
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

  // Group by category
  const groupedItems = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const sortedCategories = Object.keys(groupedItems).sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });

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

  // Purchase Order functions
  const generatePurchaseOrder = async () => {
    setPurchaseLoading(true);
    setExcludedItems(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-purchase-request');
      if (error) throw error;
      setPurchaseData(data);
      toast.success('Purchase order generated');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate order');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const sendPurchaseToTelegram = async () => {
    setSendingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-notify', {
        body: { action: 'purchase' }
      });
      if (error) throw error;
      toast.success('Purchase order sent to Telegram');
    } catch (e) {
      console.error(e);
      toast.error('Failed to send to Telegram');
    } finally {
      setSendingTelegram(false);
    }
  };

  const getFilteredPurchaseItems = () => {
    if (!purchaseData?.recommendations) return [];
    let items = purchaseData.recommendations.filter(item => !excludedItems.has(item.name));
    if (showOnlyToOrder) {
      items = items.filter(item => item.toOrder > 0);
    }
    return items;
  };

  const groupedPurchaseItems = () => {
    const items = getFilteredPurchaseItems();
    const groups: Record<string, SalesItem[]> = {};
    items.forEach(item => {
      const supplier = item.supplier || 'Others';
      if (!groups[supplier]) groups[supplier] = [];
      groups[supplier].push(item);
    });
    return groups;
  };

  const exportPurchaseCSV = () => {
    const items = getFilteredPurchaseItems();
    const csv = [
      ['Supplier', 'Item', 'In Stock', 'Avg/Day', 'Recommended', 'To Order', 'Cases', 'Case Size'].join(','),
      ...items.map(item => [
        `"${item.supplier || 'Others'}"`,
        `"${item.name}"`,
        item.inStock,
        item.avgPerDay.toFixed(1),
        item.recommendedQty,
        item.toOrder,
        item.casesToOrder,
        item.caseSize
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `purchase_order_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const supplierStyles: Record<string, { emoji: string; color: string; bg: string }> = {
    'San Miguel': { emoji: '🍺', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    'Tanduay': { emoji: '🥃', color: 'text-orange-500', bg: 'bg-orange-500/10' },
    'Soft Drinks': { emoji: '🥤', color: 'text-blue-500', bg: 'bg-blue-500/10' },
    'Snacks': { emoji: '🍿', color: 'text-purple-500', bg: 'bg-purple-500/10' },
    'Others': { emoji: '📦', color: 'text-muted-foreground', bg: 'bg-muted/30' }
  };

  // Check if item is critically low (stock covers less than 1 day)
  const isCriticallyLow = (item: SalesItem) => {
    if (item.avgPerDay <= 0) return false;
    const daysOfStock = item.inStock / item.avgPerDay;
    return daysOfStock < 1;
  };

  // Check if item is low (stock covers less than 2 days)
  const isLowStock = (item: SalesItem) => {
    if (item.avgPerDay <= 0) return false;
    const daysOfStock = item.inStock / item.avgPerDay;
    return daysOfStock < 2 && daysOfStock >= 1;
  };

  // Get critical items
  const getCriticalItems = () => {
    if (!purchaseData?.recommendations) return [];
    return purchaseData.recommendations
      .filter(item => !excludedItems.has(item.name) && isCriticallyLow(item))
      .sort((a, b) => (a.inStock / a.avgPerDay) - (b.inStock / b.avgPerDay));
  };

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto pb-24">
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

      {/* Tabs */}
      <Tabs defaultValue="stock" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="stock" className="flex-1 gap-2">
            <Package className="w-4 h-4" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex-1 gap-2">
            <ShoppingCart className="w-4 h-4" />
            Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4 mt-4">
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
                  {sortedCategories.map(category => (
                    <div key={category}>
                      <div className="sticky top-0 bg-primary/10 px-3 py-2 font-semibold text-sm border-b flex items-center justify-between">
                        <span>{category}</span>
                        <Badge variant="outline" className="text-xs">
                          {groupedItems[category].length} items
                        </Badge>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {groupedItems[category].map((item) => (
                            <tr key={item.item_id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-3">
                                <div className="font-medium">{item.item_name}</div>
                              </td>
                              <td className="text-right py-2 px-3 w-24">
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
                              <td className="text-right py-2 px-3 w-24 text-muted-foreground">
                                ₱{item.total_value.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 w-16">
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
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4 mt-4">
          {/* Generate Button & Controls */}
          <div className="flex items-center justify-between gap-3">
            <Button 
              onClick={generatePurchaseOrder} 
              disabled={purchaseLoading}
              className="flex-1"
            >
              {purchaseLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Generate Order
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">To order only</span>
              <Switch checked={showOnlyToOrder} onCheckedChange={setShowOnlyToOrder} />
            </div>
          </div>

          {/* Analysis Info */}
          {purchaseData && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-muted-foreground">Analysis: {purchaseData.analysisDays} days + {purchaseData.bufferDays} days buffer</span>
                  </div>
                  <Badge variant="secondary">{getFilteredPurchaseItems().length} items</Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Critical Low Stock Alert */}
          {purchaseData && getCriticalItems().length > 0 && (
            <Card className="border-red-500/50 bg-red-500/10 animate-pulse">
              <CardHeader className="py-2 pb-1">
                <CardTitle className="text-sm flex items-center gap-2 text-red-500">
                  <AlertTriangle className="w-4 h-4" />
                  Critical Low Stock
                  <Badge className="ml-auto bg-red-500 text-white">{getCriticalItems().length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="space-y-1.5">
                  {getCriticalItems().slice(0, 5).map(item => {
                    const daysLeft = item.avgPerDay > 0 ? (item.inStock / item.avgPerDay).toFixed(1) : '∞';
                    return (
                      <div key={item.name} className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-red-600">{item.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-red-500/80">
                            <span>Only {item.inStock} left</span>
                            <span>•</span>
                            <span>~{daysLeft} days</span>
                          </div>
                        </div>
                        <Badge className="bg-red-500 text-white text-xs">
                          Need +{item.toOrder}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Purchase Items by Supplier */}
          {purchaseData ? (
            <div className="space-y-4">
              {Object.entries(groupedPurchaseItems()).map(([supplier, items]) => {
                const style = supplierStyles[supplier] || supplierStyles['Others'];
                return (
                  <Card key={supplier} className={cn("border-border/50", style.bg)}>
                    <CardHeader className="py-2 pb-1">
                      <CardTitle className={cn("text-sm flex items-center gap-2", style.color)}>
                        <span>{style.emoji}</span>
                        {supplier}
                        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2">
                      <div className="space-y-1.5">
                        {items.map(item => {
                          const critical = isCriticallyLow(item);
                          const low = isLowStock(item);
                          const daysLeft = item.avgPerDay > 0 ? (item.inStock / item.avgPerDay).toFixed(1) : '∞';
                          
                          return (
                            <div 
                              key={item.name} 
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg",
                                critical ? "bg-red-500/20 border border-red-500/40" :
                                low ? "bg-amber-500/10 border border-amber-500/30" :
                                "bg-background/50"
                              )}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={cn(
                                    "text-sm font-medium truncate",
                                    critical && "text-red-600",
                                    low && "text-amber-600"
                                  )}>{item.name}</p>
                                  {critical && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span className={cn(critical && "text-red-500", low && "text-amber-500")}>
                                    Stock: {item.inStock} (~{daysLeft}d)
                                  </span>
                                  <span>•</span>
                                  <span>Avg: {item.avgPerDay.toFixed(1)}/day</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {item.toOrder > 0 ? (
                                  <div className="text-right">
                                    <p className={cn(
                                      "text-sm font-bold",
                                      critical ? "text-red-500" : low ? "text-amber-500" : style.color
                                    )}>+{item.toOrder}</p>
                                    {item.casesToOrder > 0 && (
                                      <p className="text-[10px] text-muted-foreground">{item.casesToOrder} cases × {item.caseSize}</p>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">OK</Badge>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setExcludedItems(prev => new Set([...prev, item.name]))}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Action Buttons */}
              {getFilteredPurchaseItems().length > 0 && (
                <div className="flex gap-2">
                  <Button 
                    variant="default"
                    className="flex-1"
                    onClick={sendPurchaseToTelegram}
                    disabled={sendingTelegram}
                  >
                    {sendingTelegram ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Send to Telegram
                  </Button>
                  <Button variant="outline" onClick={exportPurchaseCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Click "Generate Order" to analyze inventory</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Uses 3-day sales average + 2-day delivery buffer</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
