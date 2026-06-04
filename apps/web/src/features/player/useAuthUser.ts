import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getAuthSession } from "../../lib/apiClient";

export function useAuthUser() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    getAuthSession().then((session) => {
      setCurrentUser(session?.user ?? null);
    });
  }, []);

  return currentUser;
}
