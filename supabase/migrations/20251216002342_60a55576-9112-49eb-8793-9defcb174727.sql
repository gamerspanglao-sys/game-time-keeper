-- Drop old constraint
ALTER TABLE public.cash_expenses DROP CONSTRAINT cash_expenses_category_check;

-- Add new constraint with all categories
ALTER TABLE public.cash_expenses ADD CONSTRAINT cash_expenses_category_check 
CHECK (category = ANY (ARRAY[
  'purchases',
  'salaries', 
  'other',
  'employee_food',
  'food_hunters',
  'advance',
  'equipment',
  'inventory',
  'investor_purchases',
  'investor_equipment',
  'investor_inventory',
  'investor_other'
]::text[]));