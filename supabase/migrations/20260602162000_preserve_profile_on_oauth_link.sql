CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'username', ''),
      NULLIF(new.raw_user_meta_data->>'user_name', ''),
      NULLIF(split_part(COALESCE(new.email, ''), '@', 1), ''),
      'player'
    ),
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
