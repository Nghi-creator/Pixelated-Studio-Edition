export interface GameComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
  comment_likes: {
    user_id: string;
    is_like: boolean;
  }[];
}
