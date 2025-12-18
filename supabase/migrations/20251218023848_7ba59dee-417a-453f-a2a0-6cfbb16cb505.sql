-- Drop old constraint and add new one with 'archived' status
ALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check CHECK (status IN ('open', 'ended', 'closed', 'archived'));