import React, { useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  TrendingUp, 
  ShoppingCart,
  Loader2,
  Download,
  Send,
  X
} from 'lucide-react';

interface PurchaseItem {
  name: string;
  totalQuantity: number;
  avgPerDay: number;
  recommendedQty: number;
  inStock: number;
  toOrder: number;
  caseSize: number;
  casesToOrder: number;
  category: string;
  supplier?: string;
  note?: string;
}

interface PurchaseData {
  period: { days: number; deliveryBuffer?: number };
  totalReceipts: number;
  towerSales?: number;
  basketSales?: number;
  recommendations: PurchaseItem[];
}

const SUPPLIER_CONFIG: Record<string, { label: string; color: string }> = {
  'San Miguel': { label: 'San Miguel (Beer)', color: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
  'Tanduay': { label: 'Tanduay', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
  'Soft Drinks': { label: 'Soft Drinks', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
  'Snacks': { label: 'Snacks', color: 'bg-purple-500/20 text-purple-500 border-purple-500/30' },
  'Others': { label: 'Others', color: 'bg-muted text-muted-foreground border-muted' },
};

export default function Finance() {
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [sendingPurchase, setSendingPurchase] = useState(false);
  const [sendingCash, setSendingCash] = useState(false);
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null);
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [showAllItems, setShowAllItems] = useState(true);

  const fetchPurchaseData = async () => {
    setPurchaseLoading(true);
    setRemovedItems(new Set());
    
    try {
      const { data: response, error } = await supabase.functions.invoke('loyverse-purchase-request');
      if (error) throw error;
      if (!response.success) throw new Error(response.error);

      setPurchaseData(response);
      toast.success(`Analyzed ${response.totalReceipts} receipts, ${response.recommendations.length} products`);
    } catch (error: any) {
      console.error('Error fetching purchase data:', error);
      toast.error(error.message || 'Failed to fetch data');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const sendToTelegram = async (action: 'purchase' | 'cash') => {
    const isCash = action === 'cash';
    if (isCash) setSendingCash(true);
    else setSendingPurchase(true);
    
    try {
      const { data: response, error } = await supabase.functions.invoke('telegram-notify', {
        body: { action }
      });
      if (error) throw error;
      if (!response.success) throw new Error(response.error || 'Failed to send');
      toast.success(isCash ? 'Cash report sent to Telegram' : 'Purchase order sent to Telegram');
    } catch (error: any) {
      console.error('Error sending to Telegram:', error);
      toast.error(error.message || 'Failed to send to Telegram');
    } finally {
      if (isCash) setSendingCash(false);
      else setSendingPurchase(false);
    }
  };

  const removeItem = (itemName: string) => {
    setRemovedItems(prev => new Set([...prev, itemName]));
  };

  const cleanProductName = (name: string) => {
    return name.replace(/\s*\(from towers\)/gi, '').replace(/\s*\(from baskets\)/gi, '').trim();
  };

  const filteredRecommendations = purchaseData?.recommendations
    .filter(item => !removedItems.has(item.name) && (showAllItems || item.toOrder > 0))
    .sort((a, b) => {
      const categoryOrder = ['beer', 'spirits', 'cocktails', 'soft', 'other'];
      const catA = categoryOrder.indexOf(a.category);
      const catB = categoryOrder.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      if (b.toOrder !== a.toOrder) return b.toOrder - a.toOrder;
      return cleanProductName(a.name).localeCompare(cleanProductName(b.name));
    }) || [];

  const exportPurchaseToCSV = () => {
    if (!purchaseData) return;
    const headers = ['Item', 'Supplier', 'Sold (3d)', 'Avg/Day', 'In Stock', 'Need', 'Case Size', 'Cases'];
    const rows = filteredRecommendations.map(item => [
      cleanProductName(item.name), item.supplier || 'Other', item.totalQuantity, item.avgPerDay, item.inStock, item.toOrder, item.caseSize, item.casesToOrder,
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-order-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const supplierOrder = ['San Miguel', 'Tanduay', 'Soft Drinks', 'Snacks', 'Others'];
  const groupedBySupplier = filteredRecommendations.reduce((acc, item) => {
    const supplier = item.supplier || 'Other';
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(item);
    return acc;
  }, {} as Record<string, PurchaseItem[]>);
  
  const sortedSuppliers = Object.keys(groupedBySupplier).sort((a, b) => supplierOrder.indexOf(a) - supplierOrder.indexOf(b));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" />
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Based on {purchaseData?.period.days || 3}-day sales analysis
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <Button onClick={fetchPurchaseData} disabled={purchaseLoading} size="lg" className="shadow-lg hover:shadow-xl transition-shadow">
            {purchaseLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate
          </Button>

          {purchaseData && filteredRecommendations.length > 0 && (
            <Button variant="outline" onClick={exportPurchaseToCSV} className="shadow-sm">
              <Download className="h-4 w-4 mr-2" />CSV
            </Button>
          )}
          
          {purchaseData && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Switch id="show-all" checked={showAllItems} onCheckedChange={setShowAllItems} />
              <Label htmlFor="show-all" className="text-sm cursor-pointer">{showAllItems ? "All" : "Order only"}</Label>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => sendToTelegram('purchase')} disabled={sendingPurchase}
          className="bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20">
          {sendingPurchase ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Order
        </Button>
        <Button variant="outline" onClick={() => sendToTelegram('cash')} disabled={sendingCash}
          className="bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20">
          {sendingCash ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Cash Report
        </Button>
      </div>

      {purchaseData && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Analysis Period</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{purchaseData.period.days} <span className="text-lg font-normal text-muted-foreground">days</span></p>
                <p className="text-xs text-muted-foreground mt-1">+{purchaseData.period.deliveryBuffer || 2} days buffer</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{purchaseData.totalReceipts.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">transactions analyzed</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Products</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{filteredRecommendations.length}</p>
                <p className="text-xs text-muted-foreground mt-1">items to review</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To Order</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{filteredRecommendations.reduce((sum, item) => sum + item.toOrder, 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">{filteredRecommendations.reduce((sum, item) => sum + item.casesToOrder, 0)} cases total</p>
              </CardContent>
            </Card>
          </div>

          {/* Products by Supplier */}
          {sortedSuppliers.map(supplier => {
            const items = groupedBySupplier[supplier];
            const config = SUPPLIER_CONFIG[supplier] || SUPPLIER_CONFIG['Others'];
            const supplierTotal = items.reduce((sum, i) => sum + i.toOrder, 0);
            const supplierCases = items.reduce((sum, i) => sum + i.casesToOrder, 0);
            
            return (
              <Card key={supplier} className="overflow-hidden">
                <CardHeader className="py-3 bg-secondary/20 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={cn("text-xs", config.color)}>{config.label}</Badge>
                      <span className="text-sm text-muted-foreground">{items.length} items</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm"><span className="font-bold text-primary">{supplierTotal}</span> units</span>
                      {supplierCases > 0 && <span className="text-sm"><span className="font-bold">{supplierCases}</span> cases</span>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/30">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="font-medium truncate">{cleanProductName(item.name)}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span>Sold: {item.totalQuantity}</span>
                            <span>Avg: {item.avgPerDay}/day</span>
                            <span className={cn("font-medium", item.inStock <= 0 ? "text-red-500" : item.inStock < item.avgPerDay * 2 ? "text-amber-500" : "text-green-500")}>
                              Stock: {item.inStock}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-center px-2 py-1 rounded bg-primary/10 min-w-[50px]">
                            <div className="text-[10px] text-muted-foreground">Need</div>
                            <div className={cn("text-base font-bold", item.toOrder > 0 ? "text-primary" : "text-muted-foreground")}>{item.toOrder}</div>
                          </div>
                          {item.caseSize > 1 && (
                            <div className="text-center px-2 py-1 rounded bg-muted/50 min-w-[50px]">
                              <div className="text-[10px] text-muted-foreground">CS({item.caseSize})</div>
                              <div className="text-base font-bold">{item.casesToOrder}</div>
                            </div>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full" onClick={() => removeItem(item.name)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredRecommendations.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {removedItems.size > 0 ? "All items removed. Click Generate to refresh." : "All items in stock!"}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!purchaseData && !purchaseLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Generate Purchase Order</h3>
            <p className="text-muted-foreground mb-4">Analyzes 7-day sales, compares with current stock, and recommends what to order.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
