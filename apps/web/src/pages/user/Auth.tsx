import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Gamepad2,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { FaGithub, FaGoogle } from "react-icons/fa";
import { supabase } from "../../lib/supabaseClient";
import { getPublicAppUrl } from "../../lib/appUrl";
import { api } from "../../lib/apiClient";

const providerLabels: Record<string, string> = {
  email: "email and password",
  github: "GitHub",
  google: "Google",
};

const formatProviders = (providers: string[]) => {
  const labels = providers
    .filter((provider) => provider !== "email")
    .map((provider) => providerLabels[provider] || provider);

  if (labels.length === 0) return "your connected provider";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
};

export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleEmailAuth = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate("/");
      } else {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const accountMethods = await api.accountMethods(email);
        if (accountMethods.exists && !accountMethods.hasEmailProvider) {
          throw new Error(
            `This email is already connected with ${formatProviders(accountMethods.providers)}. Continue with that sign-in option instead.`,
          );
        }
        if (accountMethods.exists && accountMethods.hasEmailProvider) {
          throw new Error(
            "An account already exists for this email. Sign in or use password reset instead.",
          );
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getPublicAppUrl(),
          },
        });
        if (error) throw error;
        setMessage("Success! Check your email to verify your account.");
      }
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

  const handleResetPassword = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const accountMethods = await api.accountMethods(email);
      if (accountMethods.exists && !accountMethods.hasEmailProvider) {
        throw new Error(
          `This account uses ${formatProviders(accountMethods.providers)} sign-in. Use that provider instead of password reset.`,
        );
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getPublicAppUrl()}/reset-password`,
      });
      if (error) throw error;
      setMessage("Password reset link sent! Check your email.");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to send reset email.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "github") => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getPublicAppUrl() },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-synth-surface/85 backdrop-blur-xl border border-synth-border rounded-2xl shadow-glow-card p-8 ring-1 ring-synth-primary/10">
        <div className="text-center mb-8">
          <Gamepad2 className="w-12 h-12 text-synth-primary mx-auto mb-4 drop-shadow-[0_0_16px_rgba(255,77,143,0.5)]" />
          <h2 className="text-3xl font-bold text-white mb-2">
            {isForgotPassword
              ? "Reset Password"
              : isLogin
                ? "Welcome Back"
                : "Create Account"}
          </h2>
          <p className="text-gray-400">
            {isForgotPassword
              ? "Enter your email and we'll send you a link."
              : isLogin
                ? "Enter your details to access your library."
                : "Sign up to favorite games and track progress."}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg mb-6 text-sm text-center">
            {message}
          </div>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {isForgotPassword ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-synth-primary hover:bg-synth-primary-hover text-synth-ink font-bold py-3 rounded-lg shadow-glow-primary-sm transition-all flex justify-center items-center active:scale-[0.99]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Send Reset Link"
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setError(null);
                setMessage(null);
              }}
              className="w-full text-gray-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mt-4"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </button>
          </form>
        ) : (
          /* STANDARD LOGIN / SIGNUP VIEW */
          <>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
                  required
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors hover:text-white"
                  onClick={() => setShowPassword((visible) => !visible)}
                  title={showPassword ? "Hide password" : "Show password"}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {!isLogin && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                    className="w-full bg-synth-bg border border-synth-border text-white rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-primary focus:ring-1 focus:ring-synth-primary transition-all"
                    required
                  />
                  <button
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors hover:text-white"
                    onClick={() =>
                      setShowConfirmPassword((visible) => !visible)
                    }
                    title={
                      showConfirmPassword
                        ? "Hide confirmed password"
                        : "Show confirmed password"
                    }
                    type="button"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}

              {/* Forgot Password Link (Only shows on Login) */}
              {isLogin && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-synth-primary hover:text-synth-secondary-hover text-sm transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-synth-primary hover:bg-synth-primary-hover text-synth-ink font-bold py-3 rounded-lg shadow-glow-primary-sm transition-all flex justify-center items-center active:scale-[0.99]"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isLogin ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </form>

            <div className="my-6 flex items-center">
              <div className="flex-grow border-t border-synth-border"></div>
              <span className="px-3 text-gray-500 text-sm uppercase tracking-wider">
                Or continue with
              </span>
              <div className="flex-grow border-t border-synth-border"></div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                onClick={() => handleOAuth("github")}
                className="flex items-center justify-center gap-2 bg-synth-bg hover:bg-synth-elevated border border-synth-border hover:border-synth-secondary/40 text-white py-2.5 rounded-lg transition-all"
              >
                <FaGithub className="w-5 h-5" />
                GitHub
              </button>

              <button
                onClick={() => handleOAuth("google")}
                className="flex items-center justify-center gap-2 bg-synth-bg hover:bg-synth-elevated border border-synth-border hover:border-synth-secondary/40 text-white py-2.5 rounded-lg transition-all"
              >
                <FaGoogle className="w-5 h-5" />
                Google
              </button>
            </div>

            <div className="text-center space-y-4">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setConfirmPassword("");
                  setShowConfirmPassword(false);
                  setError(null);
                  setMessage(null);
                }}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>

              <div className="block">
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-synth-primary hover:text-synth-secondary-hover text-sm font-medium transition-colors"
                >
                  Continue as Guest &rarr;
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
