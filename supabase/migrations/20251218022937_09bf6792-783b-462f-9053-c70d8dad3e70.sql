-- Add DELETE policy for shifts table
CREATE POLICY "Allow public delete access to shifts" 
ON public.shifts 
FOR DELETE 
USING (true);