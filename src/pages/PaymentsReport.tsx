import { useState } from 'react';
import { format, setHours, setMinutes, setSeconds, addDays, subDays, differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { CalendarIcon, Download, RefreshCw, Banknote, CreditCard, Receipt, TrendingUp, RotateCcw, DollarSign, Coins, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Payment {
  id: string;
  date: string;
  total: number;
  cost: number;
  profit: number;
  payments: Array<{
    type: string;
    typeId: string;
    amount: number;
  }>;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
    cost: number;
    totalCost: number;
  }>;
  note: string;
  source: string;
  isRefund?: boolean;
  refundFor?: string;
}

interface Summary {
  totalReceipts: number;
  totalRefunds: number;
  totalAmount: number;
  totalRefundAmount: number;
  netAmount: number;
  totalCost: number;
  totalProfit: number;
  byPaymentType: Record<string, { count: number; amount: number; refundCount: number; refundAmount: number }>;
}

export default function PaymentsReport() {
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState('05:00');
  const [endTime, setEndTime] = useState('05:00');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if date is within 30 days limit
  const maxPastDate = subDays(new Date(), 30);
  const isStartDateTooOld = startDate < maxPastDate;

  const fetchPayments = async () => {
    if (isStartDateTooOld) {
      toast.error('Loyverse free plan only allows data from last 30 days');
      return;
    }
    
    setIsLoading(true);
    try {
      // Parse start and end times
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      // Create start date with specified time
      let start = setSeconds(setMinutes(setHours(startDate, startHour), startMin), 0);
      
      // Create end date with specified time
      let end = setSeconds(setMinutes(setHours(endDate, endHour), endMin), 59);
      
      // If end time is <= start time on same date, add a day to end
      if (startDate.toDateString() === endDate.toDateString()) {
        if (endHour < startHour || (endHour === startHour && endMin <= startMin)) {
          end = addDays(end, 1);
        }
      }

      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: { startDate: start.toISOString(), endDate: end.toISOString() },
      });

      if (error) throw error;

      if (data.success) {
        setPayments(data.payments);
        setSummary(data.summary);
        const refundCount = data.payments.filter((p: Payment) => p.isRefund).length;
        toast.success(`Loaded ${data.payments.length} receipts${refundCount > 0 ? ` (${refundCount} refunds)` : ''}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching payments:', error);
      if (error.message?.includes('402') || error.message?.includes('31 days')) {
        toast.error('Loyverse limit: only last 30 days available on free plan');
      } else {
        toast.error('Failed to load payments');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('cash')) {
      return <Banknote className="w-4 h-4 text-success" />;
    }
    return <CreditCard className="w-4 h-4 text-primary" />;
  };

  const getPaymentBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('cash')) return 'secondary';
    if (lowerType.includes('gcash') || lowerType.includes('card')) return 'default';
    return 'outline';
  };

  const exportToCSV = () => {
    if (payments.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Receipt #', 'Date', 'Time', 'Type', 'Items', 'Payment Type', 'Amount', 'Cost', 'Profit', 'Source'];
    const rows = payments.map(p => {
      const paymentDate = new Date(p.date);
      const itemsStr = p.items.map(i => `${i.name} x${i.quantity}`).join('; ');
      const paymentTypes = p.payments.map(pt => pt.type).join(', ');
      return [
        p.id,
        format(paymentDate, 'yyyy-MM-dd'),
        format(paymentDate, 'HH:mm:ss'),
        p.isRefund ? 'REFUND' : 'SALE',
        itemsStr,
        paymentTypes,
        p.total.toFixed(2),
        p.cost.toFixed(2),
        p.profit.toFixed(2),
        p.source || 'POS',
      ];
    });

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments Report</h1>
          <p className="text-muted-foreground">Loyverse sales, refunds & profit data (last 30 days only)</p>
        </div>

        {isStartDateTooOld && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Start date is older than 30 days. Loyverse free plan only allows data from the last 30 days.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-end gap-3">
          {/* Start Date Picker */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, 'dd MMM yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => d && setStartDate(d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Start Time */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-[100px]"
            />
          </div>

          {/* End Date Picker */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[140px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(endDate, 'dd MMM yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) => d && setEndDate(d)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Time */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-[100px]"
            />
          </div>

          <Button onClick={fetchPayments} disabled={isLoading}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
            Load
          </Button>

          <Button variant="outline" onClick={exportToCSV} disabled={payments.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Receipt className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sales</p>
                  <p className="text-xl font-bold">{summary.totalReceipts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="text-xl font-bold">₱{summary.totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <RotateCcw className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Refunds ({summary.totalRefunds})</p>
                  <p className="text-xl font-bold text-destructive">-₱{summary.totalRefundAmount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Coins className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cost</p>
                  <p className="text-xl font-bold text-muted-foreground">₱{summary.totalCost.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-success/30">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <DollarSign className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Profit</p>
                  <p className="text-xl font-bold text-success">₱{summary.totalProfit.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {Object.entries(summary.byPaymentType).map(([type, data]) => (
            <Card key={type}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    type.toLowerCase().includes('cash') ? 'bg-success/10' : 'bg-primary/10'
                  )}>
                    {getPaymentIcon(type)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <p className="text-xl font-bold">₱{(data.amount - data.refundAmount).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.count} sales{data.refundCount > 0 && `, ${data.refundCount} ref`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {/* Receipts List */}
      {!isLoading && payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              Transactions ({payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border transition-colors",
                    payment.isRefund 
                      ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10" 
                      : "bg-card hover:bg-secondary/30"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium">#{payment.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(payment.date), 'dd MMM HH:mm')}
                      </span>
                      {payment.isRefund && (
                        <Badge variant="destructive" className="text-xs">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          REFUND
                        </Badge>
                      )}
                      {payment.source && payment.source !== 'POS' && !payment.isRefund && (
                        <Badge variant="outline" className="text-xs">
                          {payment.source}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {payment.items.map((item, i) => (
                        <span key={i}>
                          {item.name} x{item.quantity}
                          {item.cost > 0 && <span className="text-xs ml-1">(cost: ₱{item.totalCost})</span>}
                          {i < payment.items.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                    {payment.note && (
                      <p className="text-xs text-muted-foreground mt-1 italic">{payment.note}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {payment.payments.map((p, i) => (
                        <Badge key={i} variant={getPaymentBadgeVariant(p.type)}>
                          {getPaymentIcon(p.type)}
                          <span className="ml-1">{p.type}</span>
                        </Badge>
                      ))}
                    </div>
                    <div className="text-right min-w-[100px]">
                      <p className={cn(
                        "font-bold text-lg",
                        payment.isRefund && "text-destructive"
                      )}>
                        {payment.isRefund ? '-' : ''}₱{Math.abs(payment.total).toLocaleString()}
                      </p>
                      {payment.cost > 0 && (
                        <p className="text-xs text-success">
                          +₱{payment.profit.toLocaleString()} profit
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && payments.length === 0 && summary === null && (
        <Card>
          <CardContent className="py-16 text-center">
            <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No data loaded</h3>
            <p className="text-muted-foreground mb-4">
              Select date range and time, then click "Load" to fetch data from Loyverse
            </p>
            <Button onClick={fetchPayments}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Load Payments
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}