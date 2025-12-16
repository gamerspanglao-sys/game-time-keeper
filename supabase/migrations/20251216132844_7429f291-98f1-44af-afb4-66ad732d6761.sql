-- Drop existing constraint and add new one with 'investor' option
ALTER TABLE public.cash_expenses DROP CONSTRAINT IF EXISTS cash_expenses_payment_source_check;

ALTER TABLE public.cash_expenses ADD CONSTRAINT cash_expenses_payment_source_check 
CHECK (payment_source IN ('cash', 'gcash', 'investor'));