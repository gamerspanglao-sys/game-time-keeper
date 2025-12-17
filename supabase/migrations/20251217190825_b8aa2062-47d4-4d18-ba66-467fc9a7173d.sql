-- Add type column to shifts table for day/night determination
ALTER TABLE public.shifts 
ADD COLUMN IF NOT EXISTS type text DEFAULT 'day' CHECK (type IN ('day', 'night'));

-- Create cash_handovers table for shift cash handover tracking
CREATE TABLE IF NOT EXISTS public.cash_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_type text NOT NULL CHECK (shift_type IN ('day', 'night')),
  shift_date date NOT NULL,
  cash_amount integer NOT NULL DEFAULT 0,
  gcash_amount integer NOT NULL DEFAULT 0,
  change_fund_amount integer NOT NULL DEFAULT 2000,
  handed_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  handover_time timestamp with time zone NOT NULL DEFAULT now(),
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure only one handover per shift type per date
  UNIQUE(shift_type, shift_date)
);

-- Enable RLS
ALTER TABLE public.cash_handovers ENABLE ROW LEVEL SECURITY;

-- RLS policies for cash_handovers
CREATE POLICY "Allow public read access to cash_handovers"
ON public.cash_handovers FOR SELECT
USING (true);

CREATE POLICY "Allow public insert access to cash_handovers"
ON public.cash_handovers FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update access to cash_handovers"
ON public.cash_handovers FOR UPDATE
USING (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cash_handovers_shift_type_date 
ON public.cash_handovers(shift_type, shift_date DESC);

-- Update existing shifts to have type based on shift_start time
UPDATE public.shifts
SET type = CASE 
  WHEN EXTRACT(HOUR FROM shift_start AT TIME ZONE 'Asia/Manila') >= 5 
    AND EXTRACT(HOUR FROM shift_start AT TIME ZONE 'Asia/Manila') < 17 
  THEN 'day'
  ELSE 'night'
END
WHERE shift_start IS NOT NULL;