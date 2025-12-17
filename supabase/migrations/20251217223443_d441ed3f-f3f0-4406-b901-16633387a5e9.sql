-- Add change_fund_received to shifts table to track what employees actually received
ALTER TABLE public.shifts
ADD COLUMN change_fund_received integer DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.shifts.change_fund_received IS 'Change fund amount received from previous shift, as confirmed by employee at shift start';