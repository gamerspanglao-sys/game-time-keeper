-- Add shift_id column to cash_expenses for direct shift association
ALTER TABLE public.cash_expenses 
ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cash_expenses_shift_id ON public.cash_expenses(shift_id);