import {
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import type React from "react";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
} from "../../lib/auth/passwordPolicy";
import { AuthCaptcha } from "./AuthCaptcha";
import { AuthSocialActions } from "./AuthSocialActions";

export function AuthMessagePanel({
  captchaToken,
  error,
  isAuthCaptchaEnabled,
  message,
  onResendConfirmation,
  resendCooldown,
  resendLoading,
  verificationPendingEmail,
}: {
  captchaToken: string;
  error: string | null;
  isAuthCaptchaEnabled: boolean;
  message: string | null;
  onResendConfirmation: () => void;
  resendCooldown: number;
  resendLoading: boolean;
  verificationPendingEmail: string | null;
}) {
  return (
    <>
      {error && (
        <div className="danger-panel mb-6 rounded-lg border px-4 py-3 text-center text-sm font-bold">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-6 rounded-lg border border-[#C02066]/50 bg-[#9B0048]/15 px-4 py-3 text-center text-sm text-[#F38BB4]">
          <p>{message}</p>
          {verificationPendingEmail && (
            <button
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-[#C02066]/50 bg-[#9B0048]/20 px-3 py-2 font-semibold text-[#F38BB4] transition-colors hover:bg-[#9B0048]/30 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                resendLoading ||
                resendCooldown > 0 ||
                (isAuthCaptchaEnabled && !captchaToken)
              }
              onClick={onResendConfirmation}
              type="button"
            >
              {resendLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Resend verification email"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function ForgotPasswordForm({
  captchaResetKey,
  captchaToken,
  email,
  isAuthCaptchaEnabled,
  loading,
  onEmailChange,
  onSubmit,
  onTokenChange,
  showSignIn,
}: {
  captchaResetKey: number;
  captchaToken: string;
  email: string;
  isAuthCaptchaEnabled: boolean;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTokenChange: (value: string) => void;
  showSignIn: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
          required
        />
      </div>

      <AuthCaptcha onTokenChange={onTokenChange} resetKey={captchaResetKey} />

      <button
        type="submit"
        disabled={loading || (isAuthCaptchaEnabled && !captchaToken)}
        className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center active:scale-[0.99]"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          "Send Reset Link"
        )}
      </button>

      <button
        type="button"
        onClick={showSignIn}
        className="w-full text-white/80 hover:text-white text-sm transition-colors flex items-center justify-center gap-2 mt-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sign In
      </button>
    </form>
  );
}

export function EmailAuthForm({
  captchaResetKey,
  captchaToken,
  confirmPassword,
  email,
  isAuthCaptchaEnabled,
  isLogin,
  loading,
  onConfirmPasswordChange,
  onEmailChange,
  onGithubAuth,
  onGoogleAuth,
  onGuestContinue,
  onPasswordChange,
  onSubmit,
  onTokenChange,
  onToggleAuthMode,
  password,
  setShowConfirmPassword,
  setShowPassword,
  showConfirmPassword,
  showForgotPassword,
  showPassword,
}: {
  captchaResetKey: number;
  captchaToken: string;
  confirmPassword: string;
  email: string;
  isAuthCaptchaEnabled: boolean;
  isLogin: boolean;
  loading: boolean;
  onConfirmPasswordChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onGithubAuth: () => void;
  onGoogleAuth: () => void;
  onGuestContinue: () => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTokenChange: (value: string) => void;
  onToggleAuthMode: () => void;
  password: string;
  setShowConfirmPassword: (updater: (visible: boolean) => boolean) => void;
  setShowPassword: (updater: (visible: boolean) => boolean) => void;
  showConfirmPassword: boolean;
  showForgotPassword: () => void;
  showPassword: boolean;
}) {
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-synth-secondary transition-all"
            required
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            minLength={isLogin ? undefined : PASSWORD_MIN_LENGTH}
            className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-secondary transition-all"
            required
          />
          <PasswordVisibilityButton
            isVisible={showPassword}
            label="password"
            onToggle={() => setShowPassword((visible) => !visible)}
          />
        </div>

        {isLogin && (
          <div className="-mt-2 flex justify-end">
            <button
              type="button"
              onClick={showForgotPassword}
              className="text-synth-secondary hover:text-white text-sm transition-colors"
            >
              Forgot Password?
            </button>
          </div>
        )}

        {!isLogin && (
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-5 h-5" />
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              onPaste={(event) => event.preventDefault()}
              className="w-full bg-synth-bg border border-synth-border text-white placeholder:text-white/70 rounded-lg pl-10 pr-11 py-3 focus:outline-none focus:border-synth-secondary transition-all"
              required
            />
            <PasswordVisibilityButton
              isVisible={showConfirmPassword}
              label="confirmed password"
              onToggle={() => setShowConfirmPassword((visible) => !visible)}
            />
          </div>
        )}

        {!isLogin && (
          <p className="-mt-2 text-xs leading-5 text-white/80">
            {PASSWORD_POLICY_HINT}
          </p>
        )}

        <AuthCaptcha onTokenChange={onTokenChange} resetKey={captchaResetKey} />

        <button
          type="submit"
          disabled={loading || (isAuthCaptchaEnabled && !captchaToken)}
          className="w-full bg-synth-primary hover:bg-synth-primary-hover text-white font-bold py-3 rounded-lg transition-all flex justify-center items-center active:scale-[0.99]"
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

      <AuthSocialActions
        isLogin={isLogin}
        onGithubAuth={onGithubAuth}
        onGoogleAuth={onGoogleAuth}
        onGuestContinue={onGuestContinue}
        onToggleAuthMode={onToggleAuthMode}
      />
    </>
  );
}

function PasswordVisibilityButton({
  isVisible,
  label,
  onToggle,
}: {
  isVisible: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-white/70 transition-colors hover:text-white"
      onClick={onToggle}
      title={isVisible ? `Hide ${label}` : `Show ${label}`}
      type="button"
    >
      {isVisible ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );
}
