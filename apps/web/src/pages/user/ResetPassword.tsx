import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import {
  passwordRecoveryAuthorization,
  supabase,
} from "../../lib/auth/supabaseClient";
import { isPotentialPasswordRecoveryCallback } from "../../lib/auth/passwordRecoveryAuthorization";
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
} from "../../lib/auth/passwordPolicy";
import { PixelIcon } from "../../components/ui/PixelIcon";

const RECOVERY_EVENT_WAIT_MS = 5_000;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [recoveryVerified, setRecoveryVerified] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let redirectTimeoutId: number | null = null;
    let recoveryAuthorized = false;
    const callbackPending = isPotentialPasswordRecoveryCallback({
      hash: window.location.hash,
      search: window.location.search,
    });
    const clearAuthHash = () => {
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
    const authorizeRecovery = () => {
      recoveryAuthorized = true;
      if (redirectTimeoutId !== null) {
        window.clearTimeout(redirectTimeoutId);
        redirectTimeoutId = null;
      }
      setRecoveryVerified(true);
      clearAuthHash();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        passwordRecoveryAuthorization.observe(event, session) &&
        passwordRecoveryAuthorization.permits(session)
      ) {
        authorizeRecovery();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (passwordRecoveryAuthorization.permits(session)) {
        authorizeRecovery();
        return;
      }
      if (callbackPending) {
        redirectTimeoutId = window.setTimeout(() => {
          if (isMounted && !recoveryAuthorized) {
            navigate("/login", { replace: true });
          }
        }, RECOVERY_EVENT_WAIT_MS);
        return;
      }
      navigate("/login", { replace: true });
    });

    return () => {
      isMounted = false;
      if (redirectTimeoutId !== null) {
        window.clearTimeout(redirectTimeoutId);
      }
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

      passwordRecoveryAuthorization.clear();
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

  if (!recoveryVerified) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-synth-secondary" />
        <span className="sr-only">Verifying password recovery link</span>
      </div>
    );
  }

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
