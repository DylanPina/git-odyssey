export interface User {
  id: number;
  username: string;
  email?: string;
  api_credits_remaining: number;
  created_at: string;
  updated_at: string;
}
