-- Allow Super Admins to update any profile
CREATE POLICY "Super admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);