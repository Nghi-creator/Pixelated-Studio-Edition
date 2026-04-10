CREATE OR REPLACE FUNCTION public.protect_admin_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. BYPASS: If the update comes from the Supabase Dashboard or a backend server, let it pass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. If the person making the request via the React app is ALREADY an admin, let it pass
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 3. Lock normal users
  NEW.role = OLD.role;
  NEW.is_banned = OLD.is_banned;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;