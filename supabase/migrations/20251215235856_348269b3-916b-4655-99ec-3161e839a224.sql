-- Add salary_paid tracking to shifts table
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS salary_paid boolean DEFAULT false;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS salary_paid_at timestamp with time zone;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS salary_paid_amount integer;

-- Create investor_contributions table for tracking investments
CREATE TABLE IF NOT EXISTS public.investor_contributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL DEFAULT CURRENT_DATE,
  contribution_type text NOT NULL CHECK (contribution_type IN ('returnable', 'non_returnable')),
  category text NOT NULL,
  amount integer NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.investor_contributions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (same as other tables)
CREATE POLICY "Allow public read access to investor_contributions" 
ON public.investor_contributions FOR SELECT USING (true);

CREATE POLICY "Allow public insert access to investor_contributions" 
ON public.investor_contributions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access to investor_contributions" 
ON public.investor_contributions FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access to investor_contributions" 
ON public.investor_contributions FOR DELETE USING (true);