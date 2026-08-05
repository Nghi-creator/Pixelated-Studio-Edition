import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getAuthSession } from "../../../lib/api/apiClient";
import { usePermissionsQuery } from "../../../hooks/queryHooks";
import { supabase } from "../../../lib/auth/supabaseClient";
import { isAnonymousUser } from "../../../lib/auth/authIdentity";
import { useEngineConnectionStatus } from "../../../hooks/engine/useEngineConnectionStatus";

export function useNavbarIdentity() {
  const [user, setUser] = useState<User | null>(null);
  const engineConnectionStatus = useEngineConnectionStatus();
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const isKickingOut = useRef(false);

  useEffect(() => {
    let isActive = true;
    let receivedAuthEvent = false;

    const syncUser = (sessionUser: User | null) => {
      if (!isActive) return;
      setUser(isAnonymousUser(sessionUser) ? null : sessionUser);
      setIsSessionLoading(false);
    };

    getAuthSession()
      .then((session) => {
        if (!receivedAuthEvent) {
          syncUser(session?.user ?? null);
        }
      })
      .catch(() => {
        if (!receivedAuthEvent) {
          syncUser(null);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      syncUser(session?.user ?? null);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

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

  const profile = permissionsQuery.data?.profile;

  return {
    avatarUrl: profile?.avatar_url || null,
    isDeveloper: Boolean(profile?.is_developer),
    engineConnectionStatus,
    isEnginePaired: engineConnectionStatus === "online",
    isIdentityLoading:
      isSessionLoading || (Boolean(user) && permissionsQuery.isLoading),
    role: profile?.role || null,
    user,
    username: profile?.username || null,
  };
}
