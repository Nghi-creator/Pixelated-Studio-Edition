-- Give Super admins full access to SELECT, INSERT, UPDATE, and DELETE on reported_comments
CREATE POLICY "Super admins have full access to reported comments"
ON public.reported_comments
FOR ALL
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);

-- Give Super admins the ability to delete any comment
CREATE POLICY "Super admins can delete any comment"
ON public.comments
FOR DELETE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
);