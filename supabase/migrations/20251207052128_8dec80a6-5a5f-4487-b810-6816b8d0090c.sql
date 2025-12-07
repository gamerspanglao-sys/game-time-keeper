-- Create timers table for storing timer state
CREATE TABLE public.timers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    duration INTEGER NOT NULL DEFAULT 3600000,
    remaining_time INTEGER NOT NULL DEFAULT 3600000,
    remaining_at_start INTEGER,
    start_time BIGINT,
    elapsed_time INTEGER NOT NULL DEFAULT 0,
    paid_amount INTEGER NOT NULL DEFAULT 0,
    unpaid_amount INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create activity_log table for storing timer actions
CREATE TABLE public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp BIGINT NOT NULL,
    timer_id TEXT NOT NULL,
    timer_name TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily_stats table for daily statistics
CREATE TABLE public.daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_key TEXT NOT NULL UNIQUE,
    timer_stats JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create queue table for waiting lists
CREATE TABLE public.queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timer_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    added_at BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;

-- Create public access policies (this is a staff tool, no user auth needed)
CREATE POLICY "Allow public read access to timers" ON public.timers FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to timers" ON public.timers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to timers" ON public.timers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to timers" ON public.timers FOR DELETE USING (true);

CREATE POLICY "Allow public read access to activity_log" ON public.activity_log FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to activity_log" ON public.activity_log FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to daily_stats" ON public.daily_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to daily_stats" ON public.daily_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to daily_stats" ON public.daily_stats FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to queue" ON public.queue FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to queue" ON public.queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete access to queue" ON public.queue FOR DELETE USING (true);

-- Enable realtime for timers table (for cross-device sync)
ALTER PUBLICATION supabase_realtime ADD TABLE public.timers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;

-- Insert default timers
INSERT INTO public.timers (id, name, category, status, duration, remaining_time) VALUES
    ('table-1', 'Table 1', 'billiard', 'idle', 3600000, 3600000),
    ('table-2', 'Table 2', 'billiard', 'idle', 3600000, 3600000),
    ('table-3', 'Table 3', 'billiard', 'idle', 3600000, 3600000),
    ('ps-1', 'PlayStation 1', 'playstation', 'idle', 3600000, 3600000),
    ('ps-2', 'PlayStation 2', 'playstation', 'idle', 3600000, 3600000),
    ('vip-super', 'VIP Super', 'vip', 'idle', 3600000, 3600000),
    ('vip-medium', 'VIP Medium', 'vip', 'idle', 3600000, 3600000),
    ('vip-comfort', 'VIP Comfort', 'vip', 'idle', 3600000, 3600000);