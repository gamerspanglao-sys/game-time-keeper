-- Add payment_source column to cash_expenses to track if expense was paid from Cash or GCash
ALTER TABLE public.cash_expenses 
ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'cash';

-- Add check constraint for valid values
ALTER TABLE public.cash_expenses 
ADD CONSTRAINT cash_expenses_payment_source_check 
CHECK (payment_source IN ('cash', 'gcash'));