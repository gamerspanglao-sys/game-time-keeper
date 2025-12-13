import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, Package, TrendingUp, Loader2, ShoppingCart, X, Beer, Droplets } from "lucide-react";
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
  'Spirits Supplier': { label: 'Spirits & Cocktails', color: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
  'Cocktails Supplier': { label: 'Cocktails', color: 'bg-pink-500/20 text-pink-500 border-pink-500/30' },
  'Soft Drinks Supplier': { label: 'Soft Drinks', color: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
  'Other': { label: 'Other', color: 'bg-muted text-muted-foreground border-muted' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  'beer': { label: 'Beer', icon: Beer, color: 'bg-amber-500/20 text-amber-500' },
  'spirits': { label: 'Spirits (Tanduay)', icon: Droplets, color: 'bg-orange-500/20 text-orange-500' },
  'cocktails': { label: 'Cocktails', icon: Droplets, color: 'bg-pink-500/20 text-pink-500' },
  'soft': { label: 'Soft Drinks', icon: Droplets, color: 'bg-blue-500/20 text-blue-500' },
  'other': { label: 'Other', icon: Package, color: 'bg-muted text-muted-foreground' },
};

export default function PurchaseRequests() {
  const [loading, setLoading] = useState(false);
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

  const removeItem = (itemName: string) => {
    setRemovedItems(prev => new Set([...prev, itemName]));
  };

  // Filter based on toggle: show all or only items needing order
  const filteredRecommendations = data?.recommendations.filter(
    item => !removedItems.has(item.name) && (showAllItems || item.toOrder > 0)
  ) || [];

  const exportToCSV = () => {
    if (!data) return;

    const headers = ['Item', 'Category', 'Sold (7d)', 'Avg/Day', 'In Stock', 'Need', 'Case Size', 'Cases'];
    const rows = filteredRecommendations.map(item => [
      item.name,
      CATEGORY_CONFIG[item.category]?.label || item.category,
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

  // Group by supplier
  const groupedBySupplier = filteredRecommendations.reduce((acc, item) => {
    const supplier = item.supplier || 'Other';
    if (!acc[supplier]) acc[supplier] = [];
    acc[supplier].push(item);
    return acc;
  }, {} as Record<string, PurchaseItem[]>);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchase Order</h1>
          <p className="text-sm text-muted-foreground">Based on 7-day sales vs current stock</p>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <Button onClick={fetchPurchaseData} disabled={loading} size="lg">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate Order
          </Button>

          {data && filteredRecommendations.length > 0 && (
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
          
          {data && (
            <div className="flex items-center gap-2">
              <Switch 
                id="show-all" 
                checked={showAllItems} 
                onCheckedChange={setShowAllItems}
              />
              <Label htmlFor="show-all" className="text-sm">
                {showAllItems ? "All items" : "Only need order"}
              </Label>
            </div>
          )}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.period.days} days</p>
                <p className="text-xs text-muted-foreground">+{data.period.deliveryBuffer || 2} days delivery</p>
                {(data.towerSales || 0) > 0 && (
                  <p className="text-xs text-primary">🗼 Towers: {data.towerSales} (×2L)</p>
                )}
                {(data.basketSales || 0) > 0 && (
                  <p className="text-xs text-primary">🧺 Baskets: {data.basketSales}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Receipts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totalReceipts.toLocaleString()}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Units to Order</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{totalUnits}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Cases Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalCases}</p>
              </CardContent>
            </Card>
          </div>

          {Object.entries(groupedBySupplier).map(([supplier, items]) => {
            const supplierConfig = SUPPLIER_CONFIG[supplier] || SUPPLIER_CONFIG['Other'];
            const typedItems = items as PurchaseItem[];
            
            return (
              <Card key={supplier} className={cn("border", supplierConfig.color.split(' ')[2])}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Badge className={supplierConfig.color}>{supplierConfig.label}</Badge>
                    <span className="text-muted-foreground text-sm font-normal">
                      {typedItems.length} items
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {typedItems.map((item, index) => {
                      const categoryConfig = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG['other'];
                      return (
                        <div
                          key={index}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/50 gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium flex items-center gap-2">
                              {item.name}
                              <Badge variant="outline" className={cn("text-xs", categoryConfig.color)}>
                                {categoryConfig.label}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Sold: <span className="font-medium text-foreground">{item.totalQuantity}</span> (3d)
                              {item.note && <span className="text-primary ml-1">{item.note}</span>}
                              {' • '}
                              Avg: <span className="font-medium text-foreground">{item.avgPerDay}</span>/day
                              {' • '}
                              Stock: <span className={cn(
                                "font-medium",
                                item.inStock >= item.recommendedQty ? "text-success" : item.inStock > 0 ? "text-warning" : "text-destructive"
                              )}>{item.inStock}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[60px]">
                              <div className="text-xs text-muted-foreground">NEED</div>
                              <div className="text-lg font-bold text-primary">{item.toOrder}</div>
                            </div>
                            {item.caseSize > 1 && (
                              <div className="text-center min-w-[80px]">
                                <div className="text-xs text-muted-foreground">CASES ({item.caseSize})</div>
                                <div className="text-lg font-bold">{item.casesToOrder}</div>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeItem(item.name)}
                            >
                              <X className="h-4 w-4" />
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
