import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  // try to login
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'safazoom@gmail.com',
    password: 'Password123!', // guessing or we can use another way
  });
  console.log("Auth:", !!authData.session, authErr);
  
  if (!authData.session) return;
  
  const { data, error } = await supabase.from('user_profiles').insert({
    id: authData.user.id,
    email: authData.user.email,
    role: 'planner'
  });
  console.log("Insert:", error);
}
test();
