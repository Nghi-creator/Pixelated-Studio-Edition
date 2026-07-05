import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/auth/supabaseClient";
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
} from "../../lib/auth/passwordPolicy";
import { PixelIcon } from "../../components/ui/PixelIcon";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const hasAuthHash =
      window.location.hash.includes("access_token") ||
      window.location.hash.includes("type=recovery");
    const clearAuthHash = () => {
      if (hasAuthHash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session) {
        clearAuthHash();
        return;
      }
      if (!hasAuthHash) {
        navigate("/login");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        clearAuthHash();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handlePasswordReset = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(password);
    if (passwordPolicyError) {
      setError(passwordPolicyError);
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess(true);

      setTimeout(() => {
        navigate("/home");
      }, 3000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-synth-surface border border-synth-border rounded-lg shadow-card p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-[#C02066] mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-2">
            Password Updated
          </h2>
          <p className="text-gray-400">Taking you back to your library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-synth-surface border border-synth-border rounded-lg shadow-card p-8">
        <div className="text-center mb-8">
          <PixelIcon
            className="mx-auto mb-4 h-12 w-12 text-synth-secondary"
            name="brand"
          />
          <h2 className="text-3xl font-bold text-white mb-2">
            Create New Password
          </h2>
          <p className="text-gray-400">
            Enter a strong password for your account.
          </p>
        </div>

        {error && (
          <div className="danger-panel mb-6 rounded-lg border px-4 py-3 text-center text-sm font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="password"
              placeholder="New Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
              required
            />
          </div>

          <p className="-mt-2 text-xs leading-5 text-gray-400">
            {PASSWORD_POLICY_HINT}
          </p>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center mt-6 active:scale-[0.99]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Update Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
