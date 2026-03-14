import { createClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Clean up any common copy-paste issues like trailing spaces or quotes
const supabaseUrl = rawUrl.trim().replace(/^["'](.+)["']$/, '$1');
const supabaseKey = rawKey.trim().replace(/^["'](.+)["']$/, '$1');

console.log("Supabase URL check:", {
  present: !!supabaseUrl,
  length: supabaseUrl.length,
  startsWithHttp: supabaseUrl.startsWith("http")
});

console.log("Supabase Key check:", {
  present: !!supabaseKey,
  length: supabaseKey.length
});

if (!supabaseUrl || !supabaseKey || !supabaseUrl.startsWith("http")) {
  console.error("CRITICAL: Supabase environment variables are missing, invalid, or improperly formatted!");
}

// Final fallback to prevent 'Invalid value' fetch errors if the URL is completely broken
const finalUrl = supabaseUrl.startsWith("http") ? supabaseUrl : 'https://placeholder.supabase.co';
const finalKey = supabaseKey || 'placeholder';

export const supabase = createClient(finalUrl, finalKey);
