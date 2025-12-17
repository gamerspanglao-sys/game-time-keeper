-- Add approved field to cash_expenses table
ALTER TABLE public.cash_expenses ADD COLUMN approved boolean DEFAULT false;

-- Add approved field to cash_handovers table
ALTER TABLE public.cash_handovers ADD COLUMN approved boolean DEFAULT false;

-- Add cash_shortage field to shifts table for tracking employee shortages
ALTER TABLE public.shifts ADD COLUMN cash_shortage integer DEFAULT 0;