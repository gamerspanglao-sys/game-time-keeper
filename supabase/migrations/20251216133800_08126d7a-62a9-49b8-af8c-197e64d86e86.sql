-- Remove investor and add expense_type column
ALTER TABLE public.cash_expenses 
DROP CONSTRAINT IF EXISTS cash_expenses_payment_source_check;

ALTER TABLE public.cash_expenses 
ADD CONSTRAINT cash_expenses_payment_source_check 
CHECK (payment_source IN ('cash', 'gcash'));

-- Add expense_type column: 'shift' = from current shift revenue, 'balance' = from saved money
ALTER TABLE public.cash_expenses 
ADD COLUMN IF NOT EXISTS expense_type text NOT NULL DEFAULT 'shift' 
CHECK (expense_type IN ('shift', 'balance'));

-- Update any existing investor records to cash
UPDATE public.cash_expenses SET payment_source = 'cash' WHERE payment_source = 'investor';