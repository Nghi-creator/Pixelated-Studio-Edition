DROP POLICY IF EXISTS "Users can insert own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorites;

DROP POLICY IF EXISTS "Users can insert their own likes" ON public.likes;
DROP POLICY IF EXISTS "Users can update their own likes" ON public.likes;
DROP POLICY IF EXISTS "Users can delete their own likes" ON public.likes;

DROP POLICY IF EXISTS "Users can insert their own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
DROP POLICY IF EXISTS "Admins can delete any comment" ON public.comments;
DROP POLICY IF EXISTS "Super admins can delete any comment" ON public.comments;

DROP POLICY IF EXISTS "Users can insert their own comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can update their own comment likes" ON public.comment_likes;
DROP POLICY IF EXISTS "Users can delete their own comment likes" ON public.comment_likes;

DROP POLICY IF EXISTS "Users can submit reports" ON public.reported_comments;
DROP POLICY IF EXISTS "Admins can delete reports" ON public.reported_comments;
DROP POLICY IF EXISTS "Admins can view reports" ON public.reported_comments;
DROP POLICY IF EXISTS "Super admins have full access to reported comments" ON public.reported_comments;

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Allow admins and super_admins to read access logs" ON public.access_logs;
