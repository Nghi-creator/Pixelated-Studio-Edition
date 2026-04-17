-- 1. Create the Comment Likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    is_like BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, comment_id) -- Forces 1 reaction per user per comment
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- 3. Security Policies for Comment Likes
CREATE POLICY "Comment likes viewable by everyone" ON public.comment_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own comment likes" ON public.comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own comment likes" ON public.comment_likes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comment likes" ON public.comment_likes FOR DELETE USING (auth.uid() = user_id);