import { useEffect } from "react";
import { supabase } from "../auth/supabaseClient";
import { api, getAuthSession } from "../api/apiClient";

const SESSION_ID_KEY = "pixelated_access_session_id";
const LOGGED_STATE_PREFIX = "pixelated_logged_user_";

function getAccessSessionId() {
  const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (existingSessionId) return existingSessionId;

  const nextSessionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(SESSION_ID_KEY, nextSessionId);
  return nextSessionId;
}

export function useSessionTracker() {
  useEffect(() => {
    let isSubscribed = true;
    const accessSessionId = getAccessSessionId();

    const logSession = async (user_id: string | null = null) => {
      const sessionKey = LOGGED_STATE_PREFIX + (user_id || "guest");

      if (sessionStorage.getItem(sessionKey) === "true") {
        return;
      }

      sessionStorage.setItem(sessionKey, "true");

      try {
        await api.logAccess(window.location.pathname, accessSessionId);
      } catch (err) {
        console.error("Exception in logSession", err);
        sessionStorage.removeItem(sessionKey);
      }
    };

    // First attempt to grab the user payload locally
    getAuthSession().then((session) => {
      if (isSubscribed) {
        logSession(session?.user?.id || null);
      }
    });

    // Also fire off if the user transitions locally
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN") {
          logSession(session?.user?.id);
        } else if (event === "SIGNED_OUT") {
          logSession(null);
        }
      }
    );

    return () => {
      isSubscribed = false;
      authListener.subscription.unsubscribe();
    };
  }, []);
}
