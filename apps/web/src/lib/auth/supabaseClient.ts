import { createClient } from "@supabase/supabase-js";
import { createPasswordRecoveryAuthorization } from "./passwordRecoveryAuthorization";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const passwordRecoveryAuthorization =
  createPasswordRecoveryAuthorization();

supabase.auth.onAuthStateChange((event, session) => {
  passwordRecoveryAuthorization.observe(event, session);
});
