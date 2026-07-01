import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { api } from "../../../lib/api/apiClient";

export function usePlayerIdentity(
  currentUser: User | null,
  playerMode: "guest" | "host",
) {
  const [profileIdentity, setProfileIdentity] = useState<{
    userId: string;
    username: string | null;
  } | null>(null);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    let isMounted = true;
    api
      .permissions()
      .then(({ profile }) => {
        if (isMounted) {
          setProfileIdentity({
            userId: currentUser.id,
            username: profile.username,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setProfileIdentity({
            userId: currentUser.id,
            username: null,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const profileUsername =
    profileIdentity && profileIdentity.userId === currentUser?.id
      ? profileIdentity.username
      : null;

  return (
    profileUsername ||
    currentUser?.email?.split("@")[0] ||
    (playerMode === "host" ? "Host" : "Guest")
  );
}
