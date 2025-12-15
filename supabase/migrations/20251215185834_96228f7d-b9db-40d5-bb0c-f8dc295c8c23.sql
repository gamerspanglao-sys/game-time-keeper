-- Add shift column to cash_register table
ALTER TABLE public.cash_register 
ADD COLUMN shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night'));

-- Change unique constraint from date to date + shift
ALTER TABLE public.cash_register DROP CONSTRAINT IF EXISTS cash_register_date_key;
ALTER TABLE public.cash_register ADD CONSTRAINT cash_register_date_shift_key UNIQUE (date, shift);

-- Add shift column to cash_expenses
ALTER TABLE public.cash_expenses 
ADD COLUMN shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night'));