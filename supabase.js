/* ============================================================
   Supabase client setup for Evidentia
   Fill these two values in from your Supabase project:
   Project Settings → API → Project URL / anon public key
   Never put your service_role key here — only the anon key,
   this file ships to every visitor's browser.
   ============================================================ */

const SUPABASE_URL = "https://yvdcntceafjdtgvaeint.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2ZGNudGNlYWZqZHRndmFlaW50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NDM5MjksImV4cCI6MjEwNTExOTkyOX0.NpuEGtABfza1uij01VZhlaEB5Avl71cXk7z34GJ_zNo";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);