import { useState } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CalendarIcon, Download, RefreshCw, Banknote, CreditCard, Receipt, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Payment {
  id: string;
  date: string;
  total: number;
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
  }>;
  note: string;
  source: string;
}

interface Summary {
  totalReceipts: number;
  totalAmount: number;
  byPaymentType: Record<string, { count: number; amount: number }>;
}

export default function PaymentsReport() {
  const [date, setDate] = useState<Date>(new Date());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const startDate = startOfDay(date).toISOString();
      const endDate = endOfDay(date).toISOString();

      const { data, error } = await supabase.functions.invoke('loyverse-payments', {
        body: { startDate, endDate },
      });

      if (error) throw error;

      if (data.success) {
        setPayments(data.payments);
        setSummary(data.summary);
        toast.success(`Loaded ${data.payments.length} receipts`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Failed to load payments');
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

    const headers = ['Receipt #', 'Date', 'Time', 'Items', 'Payment Type', 'Amount', 'Source'];
    const rows = payments.map(p => {
      const paymentDate = new Date(p.date);
      const itemsStr = p.items.map(i => `${i.name} x${i.quantity}`).join('; ');
      const paymentTypes = p.payments.map(pt => pt.type).join(', ');
      return [
        p.id,
        format(paymentDate, 'yyyy-MM-dd'),
        format(paymentDate, 'HH:mm:ss'),
        itemsStr,
        paymentTypes,
        p.total.toFixed(2),
        p.source || 'POS',
      ];
    });

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payments_${format(date, 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payments Report</h1>
          <p className="text-muted-foreground">Loyverse sales data</p>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Receipt className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Receipts</p>
                  <p className="text-2xl font-bold">{summary.totalReceipts}</p>
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
                  <p className="text-sm text-muted-foreground">Total Sales</p>
                  <p className="text-2xl font-bold">₱{summary.totalAmount.toLocaleString()}</p>
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
                    <p className="text-sm text-muted-foreground">{type}</p>
                    <p className="text-2xl font-bold">₱{data.amount.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{data.count} transactions</p>
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
              Receipts ({payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium">#{payment.id}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(payment.date), 'HH:mm')}
                      </span>
                      {payment.source && payment.source !== 'POS' && (
                        <Badge variant="outline" className="text-xs">
                          {payment.source}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {payment.items.map((item, i) => (
                        <span key={i}>
                          {item.name} x{item.quantity}
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
                    <div className="text-right min-w-[80px]">
                      <p className="font-bold text-lg">₱{payment.total.toLocaleString()}</p>
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
              Select a date and click "Load" to fetch payments from Loyverse
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