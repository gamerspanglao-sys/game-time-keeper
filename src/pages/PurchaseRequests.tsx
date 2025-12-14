import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, Package, TrendingUp, Loader2, ShoppingCart, X, Beer, Droplets, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  'beer': { label: 'Beer', icon: Beer, color: 'bg-amber-500/20 text-amber-500' },
  'spirits': { label: 'Spirits (Tanduay)', icon: Droplets, color: 'bg-orange-500/20 text-orange-500' },
  'cocktails': { label: 'Cocktails', icon: Droplets, color: 'bg-pink-500/20 text-pink-500' },
  'soft': { label: 'Soft Drinks', icon: Droplets, color: 'bg-blue-500/20 text-blue-500' },
  'snacks': { label: 'Snacks', icon: Package, color: 'bg-purple-500/20 text-purple-500' },
  'other': { label: 'Other', icon: Package, color: 'bg-muted text-muted-foreground' },
};

export default function PurchaseRequests() {
  const [loading, setLoading] = useState(false);
  const [sendingPurchase, setSendingPurchase] = useState(false);
  const [sendingCash, setSendingCash] = useState(false);
  const [data, setData] = useState<PurchaseData | null>(null);
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set());
  const [showAllItems, setShowAllItems] = useState(true); // Show all by default

  const fetchPurchaseData = async () => {
    setLoading(true);
    setRemovedItems(new Set());
    
    try {
      const { data: response, error } = await supabase.functions.invoke('loyverse-purchase-request');

      if (error) throw error;
      if (!response.success) throw new Error(response.error);

      setData(response);
      toast.success(`Analyzed ${response.totalReceipts} receipts (7 days), ${response.recommendations.length} products`);
    } catch (error: any) {
      console.error('Error fetching purchase data:', error);
      toast.error(error.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const sendToTelegram = async (action: 'purchase' | 'cash') => {
    const isCash = action === 'cash';
    if (isCash) {
      setSendingCash(true);
    } else {
      setSendingPurchase(true);
    }
    
    try {
      const { data: response, error } = await supabase.functions.invoke('telegram-notify', {
        body: { action }
      });

      if (error) throw error;
      if (!response.success) throw new Error(response.error || 'Failed to send');

      toast.success(isCash ? 'Кассовый отчёт отправлен в Telegram' : 'Лист закупок отправлен в Telegram');
    } catch (error: any) {
      console.error('Error sending to Telegram:', error);
      toast.error(error.message || 'Ошибка отправки в Telegram');
    } finally {
      if (isCash) {
        setSendingCash(false);
      } else {
        setSendingPurchase(false);
      }
    }
  };

  const removeItem = (itemName: string) => {
    setRemovedItems(prev => new Set([...prev, itemName]));
  };

  // Clean up product names (remove "from towers", "from baskets" suffixes)
  const cleanProductName = (name: string) => {
    return name
      .replace(/\s*\(from towers\)/gi, '')
      .replace(/\s*\(from baskets\)/gi, '')
      .trim();
  };

  // Filter based on toggle: show all or only items needing order
  const filteredRecommendations = data?.recommendations
    .filter(item => !removedItems.has(item.name) && (showAllItems || item.toOrder > 0))
    .sort((a, b) => {
      // Sort by: category, then by toOrder descending, then by name
      const categoryOrder = ['beer', 'spirits', 'cocktails', 'soft', 'other'];
      const catA = categoryOrder.indexOf(a.category);
      const catB = categoryOrder.indexOf(b.category);
      if (catA !== catB) return catA - catB;
      if (b.toOrder !== a.toOrder) return b.toOrder - a.toOrder;
      return cleanProductName(a.name).localeCompare(cleanProductName(b.name));
    }) || [];

  const exportToCSV = () => {
    if (!data) return;

    const headers = ['Item', 'Supplier', 'Sold (3d)', 'Avg/Day', 'In Stock', 'Need', 'Case Size', 'Cases'];
    const rows = filteredRecommendations.map(item => [
      cleanProductName(item.name),
      item.supplier || 'Other',
      item.totalQuantity,
      item.avgPerDay,
      item.inStock,
      item.toOrder,
      item.caseSize,
      item.casesToOrder,
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

  const totalUnits = filteredRecommendations.reduce((sum, item) => sum + item.toOrder, 0);
  const totalCases = filteredRecommendations.reduce((sum, item) => sum + item.casesToOrder, 0);

  // Group by supplier with proper sorting
  const supplierOrder = ['San Miguel', 'Tanduay', 'Soft Drinks', 'Snacks', 'Others'];
  const groupedBySupplier = filteredRecommendations.reduce((acc, item) => {
    const supplier = item.supplier || 'Other';
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(item);
    return acc;
  }, {} as Record<string, PurchaseItem[]>);
  
  const sortedSuppliers = Object.keys(groupedBySupplier).sort((a, b) => {
    return supplierOrder.indexOf(a) - supplierOrder.indexOf(b);
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Purchase Order
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Based on {data?.period.days || 3}-day sales analysis
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <Button 
            onClick={fetchPurchaseData} 
            disabled={loading} 
            size="lg"
            className="shadow-lg hover:shadow-xl transition-shadow"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate Order
          </Button>

          {data && filteredRecommendations.length > 0 && (
            <Button variant="outline" onClick={exportToCSV} className="shadow-sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
          
          {data && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Switch 
                id="show-all" 
                checked={showAllItems} 
                onCheckedChange={setShowAllItems}
              />
              <Label htmlFor="show-all" className="text-sm cursor-pointer">
                {showAllItems ? "All items" : "Need order only"}
              </Label>
            </div>
          )}
        </div>
      </div>

      {/* Telegram Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button 
          variant="outline" 
          onClick={() => sendToTelegram('purchase')} 
          disabled={sendingPurchase}
          className="bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20 hover:text-blue-400"
        >
          {sendingPurchase ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Отправить закупки в Telegram
        </Button>
        <Button 
          variant="outline" 
          onClick={() => sendToTelegram('cash')} 
          disabled={sendingCash}
          className="bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20 hover:text-green-400"
        >
          {sendingCash ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Отправить кассу в Telegram
        </Button>
      </div>

      {data && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Analysis Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data.period.days} <span className="text-lg font-normal text-muted-foreground">days</span></p>
                <p className="text-xs text-muted-foreground mt-1">
                  +{data.period.deliveryBuffer || 2} days buffer
                </p>
                <div className="flex gap-3 mt-2 text-xs">
                  {(data.towerSales || 0) > 0 && (
                    <span className="text-amber-500">🗼 {data.towerSales} towers</span>
                  )}
                  {(data.basketSales || 0) > 0 && (
                    <span className="text-amber-500">🧺 {data.basketSales} baskets</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Receipts Analyzed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data.totalReceipts.toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-primary uppercase tracking-wide">
                  Units to Order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">{totalUnits}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-card to-muted/30 border-0 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Cases Total
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalCases}</p>
              </CardContent>
            </Card>
          </div>

          {/* Supplier Groups */}

          {sortedSuppliers.map((supplier) => {
            const items = groupedBySupplier[supplier];
            const supplierConfig = SUPPLIER_CONFIG[supplier] || SUPPLIER_CONFIG['Other'];
            const typedItems = items as PurchaseItem[];
            const supplierCases = typedItems.reduce((sum, item) => sum + item.casesToOrder, 0);
            
            return (
              <Card key={supplier} className="shadow-md border-0 overflow-hidden">
                <CardHeader className="pb-3 bg-gradient-to-r from-muted/50 to-transparent">
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={cn("text-sm px-3 py-1", supplierConfig.color)}>
                        {supplierConfig.label}
                      </Badge>
                      <span className="text-muted-foreground text-sm font-normal">
                        {typedItems.length} items
                      </span>
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      {supplierCases} cases
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {typedItems.map((item, index) => (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg gap-2 transition-all",
                          item.toOrder > 0 
                            ? "bg-gradient-to-r from-primary/5 to-transparent border border-primary/10" 
                            : "bg-muted/30"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {cleanProductName(item.name)}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                            <span>S:{item.totalQuantity}</span>
                            <span>A:{item.avgPerDay}/d</span>
                            <span className={cn(
                              "font-medium",
                              item.inStock >= item.recommendedQty ? "text-green-500" : item.inStock > 0 ? "text-amber-500" : "text-red-500"
                            )}>St:{item.inStock}</span>
                          </div>
                          {item.note && (
                            <div className="text-xs text-primary/80 truncate italic">
                              {item.note}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={cn(
                            "text-center px-2 py-1 rounded min-w-[45px]",
                            item.toOrder > 0 ? "bg-primary/10" : "bg-muted/50"
                          )}>
                            <div className="text-[10px] text-muted-foreground">NEED</div>
                            <div className={cn(
                              "text-base font-bold",
                              item.toOrder > 0 ? "text-primary" : "text-muted-foreground"
                            )}>{item.toOrder}</div>
                          </div>
                          {item.caseSize > 1 && (
                            <div className="text-center px-2 py-1 rounded bg-muted/50 min-w-[50px]">
                              <div className="text-[10px] text-muted-foreground">CS({item.caseSize})</div>
                              <div className="text-base font-bold">{item.casesToOrder}</div>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full"
                            onClick={() => removeItem(item.name)}
                          >
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
                {removedItems.size > 0 
                  ? "All items removed. Click Generate Order to refresh."
                  : "All items in stock! Nothing to order."
                }
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Generate Purchase Order</h3>
            <p className="text-muted-foreground mb-4">
              Analyzes 7-day sales, compares with current stock, and recommends what to order.
            </p>
            <p className="text-sm text-muted-foreground">
              Only shows items where stock is lower than daily average (+20% buffer).
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
