-- Add responsible employee tracking to expenses
ALTER TABLE public.cash_expenses 
ADD COLUMN responsible_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_cash_expenses_responsible_employee ON public.cash_expenses(responsible_employee_id);