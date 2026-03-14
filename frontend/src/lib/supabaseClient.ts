import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Supabase URL present:", !!supabaseUrl);
console.log("Supabase Key present:", !!supabaseKey);

if (!supabaseUrl || !supabaseKey || supabaseUrl === "" || supabaseKey === "") {
  console.error("CRITICAL: Supabase environment variables are missing or empty!");
}

// Ensure we pass a valid-looking URL string to prevent 'Invalid value' fetch errors
const finalUrl = (supabaseUrl && supabaseUrl.startsWith("http")) ? supabaseUrl : 'https://placeholder-if-missing.supabase.co';
const finalKey = supabaseKey || 'placeholder-key';

export const supabase = createClient(finalUrl, finalKey);
