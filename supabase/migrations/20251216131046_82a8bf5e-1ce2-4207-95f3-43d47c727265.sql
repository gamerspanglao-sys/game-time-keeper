-- Create inventory_logs table for tracking stock receipts and inventory checks
CREATE TABLE public.inventory_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL CHECK (action_type IN ('receipt', 'inventory_check', 'adjustment')),
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  previous_quantity INTEGER,
  cost_per_unit INTEGER DEFAULT 0,
  total_cost INTEGER DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read access to inventory_logs" 
ON public.inventory_logs FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to inventory_logs" 
ON public.inventory_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public delete access to inventory_logs" 
ON public.inventory_logs FOR DELETE USING (true);

-- Create index for faster queries
CREATE INDEX idx_inventory_logs_created_at ON public.inventory_logs(created_at DESC);
CREATE INDEX idx_inventory_logs_item_id ON public.inventory_logs(item_id);