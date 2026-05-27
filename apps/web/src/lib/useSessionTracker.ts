import { useEffect } from "react";
import { supabase } from "./supabaseClient";
import { api } from "./apiClient";

export function useSessionTracker() {
  useEffect(() => {
    let isSubscribed = true;

    const logSession = async (user_id: string | null = null) => {
      // Create a unique key for tracking either purely guest sessions or a specific user_id
      const sessionKey = "pixelated_logged_user_" + (user_id || "guest");
      
      // Check if we strictly already logged THIS specific state this browser load
      if (sessionStorage.getItem(sessionKey) === "true") {
        return;
      }
      
      // Lock it synchronously BEFORE the async call to prevent race conditions from auth events!
      sessionStorage.setItem(sessionKey, "true");
      
      try {
        await api.logAccess(window.location.pathname);
      } catch (err) {
        console.error("Exception in logSession", err);
        sessionStorage.removeItem(sessionKey);
      }
    };

    // First attempt to grab the user payload locally
    supabase.auth.getSession().then(({ data: { session } }) => {
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
