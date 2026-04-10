CREATE OR REPLACE FUNCTION public.protect_admin_columns()
RETURNS TRIGGER AS $$
DECLARE
  acting_user_role TEXT;
BEGIN
  -- 1. BYPASS: If the update comes from the Supabase Dashboard, let it pass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Find out the role of the person trying to make the update
  SELECT role INTO acting_user_role FROM public.profiles WHERE id = auth.uid();

  -- 3. SUPER ADMIN: Can do anything, let the update pass
  IF acting_user_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  -- 4. REGULAR ADMIN: Has restrictions
  IF acting_user_role = 'admin' THEN
    -- Admins cannot promote or demote anoyone 
    NEW.role = OLD.role;
    
    -- Admins cannot ban other admins or super_admins
    IF OLD.role IN ('admin', 'super_admin') THEN
       NEW.is_banned = OLD.is_banned;
    END IF;

    RETURN NEW;
  END IF;

  -- 5. NORMAL USERS: Lock down both columns 
  NEW.role = OLD.role;
  NEW.is_banned = OLD.is_banned;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;