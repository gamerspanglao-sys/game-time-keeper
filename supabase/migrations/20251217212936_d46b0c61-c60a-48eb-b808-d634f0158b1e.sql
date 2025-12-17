-- Drop old constraint and add new one with 'ended' status
ALTER TABLE public.shifts DROP CONSTRAINT shifts_status_check;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_status_check CHECK (status = ANY (ARRAY['open'::text, 'ended'::text, 'closed'::text]));