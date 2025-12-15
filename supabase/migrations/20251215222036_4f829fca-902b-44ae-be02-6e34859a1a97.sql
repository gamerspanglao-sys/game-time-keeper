-- Add GCash columns to cash_register table
ALTER TABLE public.cash_register 
ADD COLUMN IF NOT EXISTS gcash_expected integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS gcash_actual integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cash_expected integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS cash_actual integer DEFAULT 0;

-- Add GCash columns to shifts table
ALTER TABLE public.shifts
ADD COLUMN IF NOT EXISTS gcash_handed_over integer DEFAULT 0;