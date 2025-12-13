import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is DISABLED - auto-starting timers from Loyverse is no longer needed
// Keeping the function for potential future use

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('ℹ️ loyverse-sync is disabled - timer auto-start from POS is not needed');
  
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Sync disabled - timers are started manually from the app',
    receiptsProcessed: 0,
    timersStarted: 0 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
