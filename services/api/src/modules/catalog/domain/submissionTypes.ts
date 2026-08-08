export type SubmissionRow = {
  author_name: string;
  banner_url: string | null;
  catalog_candidate_id?: string | null;
  cover_url: string | null;
  created_at: string;
  description: string | null;
  email: string;
  game_title: string;
  id: string;
  review_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rom_url: string;
  status: string;
  submitter_id: string | null;
};
