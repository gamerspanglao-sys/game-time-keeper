-- Add cost column for cost of goods sold
ALTER TABLE public.cash_register ADD COLUMN IF NOT EXISTS cost integer NOT NULL DEFAULT 0;

-- Add gross_profit computed or we'll calculate it in code