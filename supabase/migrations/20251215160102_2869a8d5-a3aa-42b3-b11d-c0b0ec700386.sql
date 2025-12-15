-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Таблица ежедневных записей кассы
CREATE TABLE public.cash_register (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  opening_balance INTEGER NOT NULL DEFAULT 0,
  expected_sales INTEGER NOT NULL DEFAULT 0,
  actual_cash INTEGER,
  discrepancy INTEGER,
  purchases INTEGER NOT NULL DEFAULT 0,
  salaries INTEGER NOT NULL DEFAULT 0,
  other_expenses INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица детальных расходов
CREATE TABLE public.cash_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID NOT NULL REFERENCES public.cash_register(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('purchases', 'salaries', 'other')),
  amount INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_expenses ENABLE ROW LEVEL SECURITY;

-- Public access policies for cash_register
CREATE POLICY "Allow public read access to cash_register" 
ON public.cash_register FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to cash_register" 
ON public.cash_register FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to cash_register" 
ON public.cash_register FOR UPDATE USING (true);

-- Public access policies for cash_expenses
CREATE POLICY "Allow public read access to cash_expenses" 
ON public.cash_expenses FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to cash_expenses" 
ON public.cash_expenses FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to cash_expenses" 
ON public.cash_expenses FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access to cash_expenses" 
ON public.cash_expenses FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_cash_register_updated_at
BEFORE UPDATE ON public.cash_register
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_expenses;