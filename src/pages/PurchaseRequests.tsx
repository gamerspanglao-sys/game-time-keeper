import { useState } from "react";
import { format, subDays } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, Package, TrendingUp, Loader2, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PurchaseItem {
  name: string;
  totalQuantity: number;
  totalAmount: number;
  avgPerDay: number;
  recommendedQty: number;
  caseSize: number;
  casesToOrder: number;
  productType: string;
}

interface PurchaseData {
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  totalReceipts: number;
  recommendations: PurchaseItem[];
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  'beer_liter': 'Beer (1L)',
  'beer_small': 'Beer',
  'water': 'Water',
  'soft_drink': 'Soft Drinks',
  'default': 'Other',
};

const PRODUCT_TYPE_COLORS: Record<string, string> = {
  'beer_liter': 'bg-amber-500/20 text-amber-500',
  'beer_small': 'bg-yellow-500/20 text-yellow-500',
  'water': 'bg-blue-500/20 text-blue-500',
  'soft_drink': 'bg-green-500/20 text-green-500',
  'default': 'bg-muted text-muted-foreground',
};

export default function PurchaseRequests() {
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PurchaseData | null>(null);

  const fetchPurchaseData = async () => {
    setLoading(true);
    try {
      // Set times: start at 05:00, end at 05:00 next day
      const startDateTime = new Date(startDate);
      startDateTime.setHours(5, 0, 0, 0);
      
      const endDateTime = new Date(endDate);
      endDateTime.setDate(endDateTime.getDate() + 1);
      endDateTime.setHours(5, 0, 59, 999);

      const { data: response, error } = await supabase.functions.invoke('loyverse-purchase-request', {
        body: {
          startDate: startDateTime.toISOString(),
          endDate: endDateTime.toISOString(),
        },
      });

      if (error) throw error;
      if (!response.success) throw new Error(response.error);

      setData(response);
      toast.success(`Analyzed ${response.totalReceipts} receipts`);
    } catch (error: any) {
      console.error('Error fetching purchase data:', error);
      toast.error(error.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;

    const headers = ['Item', 'Type', 'Total Sold', 'Avg/Day', 'Recommended', 'Case Size', 'Cases to Order'];
    const rows = data.recommendations
      .filter(item => item.casesToOrder > 0)
      .map(item => [
        item.name,
        PRODUCT_TYPE_LABELS[item.productType] || item.productType,
        item.totalQuantity,
        item.avgPerDay,
        item.recommendedQty,
        item.caseSize,
        item.casesToOrder,
      ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-request-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalCases = data?.recommendations.reduce((sum, item) => sum + item.casesToOrder, 0) || 0;
  const itemsToOrder = data?.recommendations.filter(item => item.casesToOrder > 0).length || 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-2xl font-bold">Purchase Requests</h1>
        
        <div className="flex flex-wrap gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(startDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">to</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(endDate, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button onClick={fetchPurchaseData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
            Generate
          </Button>

          {data && (
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Period</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.period.days} days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Receipts Analyzed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.totalReceipts}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Items to Order</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{itemsToOrder}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Cases</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{totalCases}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Purchase Request (Avg + 20% buffer)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recommendations
                  .filter(item => item.casesToOrder > 0)
                  .map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-muted/50 gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.name}</span>
                          <Badge variant="outline" className={cn("text-xs", PRODUCT_TYPE_COLORS[item.productType])}>
                            {PRODUCT_TYPE_LABELS[item.productType] || item.productType}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Sold: {item.totalQuantity} • Avg/day: {item.avgPerDay} • Case: {item.caseSize}pcs
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Recommended</div>
                          <div className="font-medium">{item.recommendedQty} pcs</div>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <div className="text-xs text-muted-foreground">ORDER</div>
                          <div className="text-xl font-bold text-primary">{item.casesToOrder} cases</div>
                        </div>
                      </div>
                    </div>
                  ))}

                {data.recommendations.filter(item => item.casesToOrder > 0).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No items need ordering based on current sales data
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && !loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Generate Purchase Request</h3>
            <p className="text-muted-foreground mb-4">
              Select a date range (default: last 30 days) and click Generate to analyze sales and create purchase recommendations.
            </p>
            <p className="text-sm text-muted-foreground">
              Recommendations include a 20% buffer above average daily sales.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
