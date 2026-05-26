import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Gamepad2, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/login");
      }
    });
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

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
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
        navigate("/");
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
        <div className="w-full max-w-md bg-synth-surface/85 backdrop-blur-xl border border-synth-border rounded-2xl shadow-glow-card p-12 text-center ring-1 ring-synth-primary/10">
          <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-6" />
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
      <div className="w-full max-w-md bg-synth-surface/85 backdrop-blur-xl border border-synth-border rounded-2xl shadow-glow-card p-8 ring-1 ring-synth-primary/10">
        <div className="text-center mb-8">
          <Gamepad2 className="w-12 h-12 text-synth-primary mx-auto mb-4 drop-shadow-[0_0_16px_rgba(255,77,143,0.5)]" />
          <h2 className="text-3xl font-bold text-white mb-2">
            Create New Password
          </h2>
          <p className="text-gray-400">
            Enter a strong password for your account.
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm text-center">
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
              className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-synth-primary hover:bg-synth-primary-hover text-synth-ink font-bold py-3 rounded-lg shadow-glow-primary-sm transition-all flex justify-center items-center mt-6 active:scale-[0.99]"
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
