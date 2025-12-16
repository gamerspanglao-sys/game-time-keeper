-- Add date column to cash_expenses
ALTER TABLE public.cash_expenses ADD COLUMN IF NOT EXISTS date date;

-- Update existing records with date from linked cash_register
UPDATE public.cash_expenses ce
SET date = cr.date
FROM public.cash_register cr
WHERE ce.cash_register_id = cr.id AND ce.date IS NULL;

-- Set default for new records
ALTER TABLE public.cash_expenses ALTER COLUMN date SET DEFAULT CURRENT_DATE;