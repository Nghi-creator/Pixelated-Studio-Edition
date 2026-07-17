import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { getAuthSession } from "../../../lib/api/apiClient";
import { usePermissionsQuery } from "../../../lib/api/apiQueries";
import { queryKeys } from "../../../lib/api/queryClient";
import { supabase } from "../../../lib/auth/supabaseClient";
import {
  ENGINE_PAIRING_EVENT,
  hasEngineToken,
} from "../../../lib/engine/engineAuth";

export function useNavbarIdentity() {
  const [user, setUser] = useState<User | null>(null);
  const [isEnginePaired, setIsEnginePaired] = useState(hasEngineToken);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const isKickingOut = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const syncUser = (sessionUser: User | null) => {
      setUser(sessionUser);
      setIsSessionLoading(false);
    };

    getAuthSession().then((session) => {
      syncUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
      syncUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const permissionsQuery = usePermissionsQuery({
    enabled: Boolean(user),
  });

  useEffect(() => {
    const data = permissionsQuery.data;
    if (!user || !data || !data.profile.is_banned) return;
    if (isKickingOut.current) return;
    isKickingOut.current = true;

    supabase.auth.signOut().then(() => {
      setUser(null);
      alert("Your account has been permanently suspended.");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    });
  }, [permissionsQuery.data, user]);

  useEffect(() => {
    const refreshEnginePairing = () => setIsEnginePaired(hasEngineToken());
    window.addEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, refreshEnginePairing);
  }, []);

  const profile = permissionsQuery.data?.profile;

  return {
    avatarUrl: profile?.avatar_url || null,
    isDeveloper: Boolean(profile?.is_developer),
    isEnginePaired,
    isIdentityLoading:
      isSessionLoading || (Boolean(user) && permissionsQuery.isLoading),
    role: profile?.role || null,
    user,
    username: profile?.username || null,
  };
}
