import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Package, Download, RefreshCw, DollarSign } from 'lucide-react';

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

  const loadInventory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('loyverse-sync', {
        body: { action: 'inventory' }
      });

      if (error) throw error;
      
      if (data?.inventory) {
        const inventoryItems: InventoryItem[] = data.inventory
          .filter((item: any) => item.in_stock > 0)
          .map((item: any) => ({
            item_id: item.item_id,
            item_name: item.item_name,
            in_stock: item.in_stock || 0,
            cost: item.cost || 0,
            total_value: (item.in_stock || 0) * (item.cost || 0),
            category: item.category_name
          }))
          .sort((a: InventoryItem, b: InventoryItem) => b.total_value - a.total_value);
        
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

  useEffect(() => {
    loadInventory();
  }, []);

  const filteredItems = items.filter(item =>
    item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalValue = items.reduce((sum, item) => sum + item.total_value, 0);
  const totalItems = items.reduce((sum, item) => sum + item.in_stock, 0);

  const exportToExcel = () => {
    const rows: any[] = [
      ['ОСТАТКИ НА СКЛАДЕ', format(new Date(), 'dd.MM.yyyy HH:mm')],
      ['Позиция', 'Количество', 'Себестоимость', 'Сумма'],
    ];

    items.forEach(item => {
      rows.push([
        item.item_name,
        item.in_stock,
        item.cost,
        item.total_value
      ]);
    });

    rows.push([]);
    rows.push(['ИТОГО', totalItems, '', totalValue]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Остатки');
    XLSX.writeFile(wb, `inventory_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Экспорт завершен');
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">Остатки на складе</h1>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadInventory} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Обновить
            </Button>
            <Button variant="outline" onClick={exportToExcel} className="gap-2">
              <Download className="w-4 h-4" />
              Excel
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-500" />
              <div>
                <div className="text-sm text-muted-foreground">Позиций</div>
                <div className="text-2xl font-bold">{items.length}</div>
                <div className="text-xs text-muted-foreground">{totalItems.toLocaleString()} шт.</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-500" />
              <div>
                <div className="text-sm text-muted-foreground">Стоимость</div>
                <div className="text-2xl font-bold">₱{totalValue.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">по себестоимости</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <Input
          placeholder="Поиск по названию..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">
            Товары ({filteredItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {items.length === 0 ? 'Нажмите "Обновить" для загрузки данных' : 'Ничего не найдено'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-3 px-4 font-semibold">Позиция</th>
                    <th className="text-right py-3 px-4 font-semibold">Кол-во</th>
                    <th className="text-right py-3 px-4 font-semibold">Цена</th>
                    <th className="text-right py-3 px-4 font-semibold">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.item_id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <div>{item.item_name}</div>
                        {item.category && (
                          <div className="text-xs text-muted-foreground">{item.category}</div>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        <Badge variant="secondary">{item.in_stock}</Badge>
                      </td>
                      <td className="text-right py-3 px-4 text-muted-foreground">
                        ₱{item.cost.toLocaleString()}
                      </td>
                      <td className="text-right py-3 px-4 font-medium">
                        ₱{item.total_value.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-bold">
                    <td className="py-3 px-4">ИТОГО</td>
                    <td className="text-right py-3 px-4">{totalItems.toLocaleString()}</td>
                    <td className="text-right py-3 px-4"></td>
                    <td className="text-right py-3 px-4">₱{totalValue.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
