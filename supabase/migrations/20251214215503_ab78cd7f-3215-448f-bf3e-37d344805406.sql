-- Add hours column to queue table for prepaid reservation hours (1-5)
ALTER TABLE public.queue ADD COLUMN hours integer NOT NULL DEFAULT 1;

-- Add check constraint to ensure hours is between 1 and 5
ALTER TABLE public.queue ADD CONSTRAINT queue_hours_check CHECK (hours >= 1 AND hours <= 5);