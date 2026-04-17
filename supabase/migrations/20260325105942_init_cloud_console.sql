-- 1. THE GAMES TABLE (The Library)
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  rom_filename TEXT NOT NULL UNIQUE,
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. THE PROFILES TABLE (Linked directly to Supabase Authentication)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. THE FAVORITES TABLE (The Junction tying Users to Games)
CREATE TABLE favorites (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, game_id) -- Prevents a user from favoriting the same game twice
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) - The Cloud Bouncer
-- ==========================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Anyone can look at the game library
CREATE POLICY "Games are viewable by everyone" ON games FOR SELECT USING (true);

-- Users can only see, add, or delete their OWN favorites
CREATE POLICY "Users can view own favorites" ON favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own favorites" ON favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites FOR DELETE USING (auth.uid() = user_id);