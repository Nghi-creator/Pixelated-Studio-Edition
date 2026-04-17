-- ==========================================
-- 1. UPGRADE PROFILES TABLE
-- ==========================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false NOT NULL;

-- ==========================================
-- 2. CREATE REPORTED COMMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.reported_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Forces 1 report per user per comment so you don't get spammed
    UNIQUE(comment_id, reporter_id) 
);

-- Turn on Row Level Security
ALTER TABLE public.reported_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Any logged-in user can submit a report
CREATE POLICY "Users can submit reports" 
ON public.reported_comments FOR INSERT 
WITH CHECK (auth.uid() = reporter_id);

-- Policy: ONLY Admins can view the reports
CREATE POLICY "Admins can view reports" 
ON public.reported_comments FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policy: ONLY Admins can delete reports (when they resolve them)
CREATE POLICY "Admins can delete reports" 
ON public.reported_comments FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==========================================
-- 3. UPGRADE ADMIN POWERS
-- ==========================================
-- Policy: Allow admins to delete ANY comment
CREATE POLICY "Admins can delete any comment" 
ON public.comments FOR DELETE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Policy: Allow admins to update ANY profile 
CREATE POLICY "Admins can update any profile" 
ON public.profiles FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==========================================
-- 4. THE SECURITY LOCK (PREVENT PRIVILEGE ESCALATION)
-- ==========================================
-- Use a database trigger to stop normal users from making themselves admins
CREATE OR REPLACE FUNCTION public.protect_admin_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- If the person making the request is already an admin, let the update pass through
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  -- If a normal user is trying to update their profile,
  -- silently force the 'role' and 'is_banned' columns to stay exactly as they were.
  NEW.role = OLD.role;
  NEW.is_banned = OLD.is_banned;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to the profiles table
DROP TRIGGER IF EXISTS ensure_admin_columns ON public.profiles;
CREATE TRIGGER ensure_admin_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_admin_columns();