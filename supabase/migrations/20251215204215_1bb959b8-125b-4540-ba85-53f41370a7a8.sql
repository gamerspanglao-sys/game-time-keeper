-- Employees table
CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT DEFAULT 'Staff',
  telegram_id TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- RLS policies for employees
CREATE POLICY "Allow public read access to employees" ON public.employees FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to employees" ON public.employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to employees" ON public.employees FOR UPDATE USING (true);

-- Shifts Log table
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  shift_start TIMESTAMP WITH TIME ZONE,
  shift_end TIMESTAMP WITH TIME ZONE,
  total_hours NUMERIC(4,2) DEFAULT 0,
  shift_type TEXT DEFAULT '12 hours',
  base_salary INTEGER DEFAULT 500,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  expected_cash INTEGER DEFAULT 0,
  cash_handed_over INTEGER,
  cash_difference INTEGER,
  cash_comment TEXT,
  cash_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- RLS policies for shifts
CREATE POLICY "Allow public read access to shifts" ON public.shifts FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to shifts" ON public.shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to shifts" ON public.shifts FOR UPDATE USING (true);

-- Bonuses table
CREATE TABLE public.bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus_type TEXT NOT NULL CHECK (bonus_type IN ('sold_goods', 'vip_room', 'hookah', 'other')),
  quantity INTEGER DEFAULT 1,
  amount INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

-- RLS policies for bonuses
CREATE POLICY "Allow public read access to bonuses" ON public.bonuses FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to bonuses" ON public.bonuses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete access to bonuses" ON public.bonuses FOR DELETE USING (true);

-- Enable realtime for shifts (to track active shifts)
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bonuses;