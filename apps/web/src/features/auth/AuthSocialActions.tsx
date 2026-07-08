import { FaGithub, FaGoogle } from "react-icons/fa";

export function AuthSocialActions({
  isLogin,
  onGithubAuth,
  onGoogleAuth,
  onGuestContinue,
  onToggleAuthMode,
}: {
  isLogin: boolean;
  onGithubAuth: () => void;
  onGoogleAuth: () => void;
  onGuestContinue: () => void;
  onToggleAuthMode: () => void;
}) {
  return (
    <>
      <div className="my-6 flex items-center">
        <div className="flex-grow border-t border-synth-border" />
        <span className="px-3 text-sm uppercase tracking-wider text-white">
          Or continue with
        </span>
        <div className="flex-grow border-t border-synth-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={onGithubAuth}
          className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap bg-synth-bg hover:bg-synth-elevated border border-synth-border text-white px-3 py-2.5 rounded-lg transition-all"
        >
          <FaGithub className="w-5 h-5" />
          GitHub
        </button>

        <button
          onClick={onGoogleAuth}
          className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap bg-synth-bg hover:bg-synth-elevated border border-synth-border text-white px-3 py-2.5 rounded-lg transition-all"
        >
          <FaGoogle className="w-5 h-5" />
          Google
        </button>
      </div>

      <div className="text-center space-y-4">
        <button
          type="button"
          onClick={onToggleAuthMode}
          className="text-white/80 hover:text-white text-sm transition-colors"
        >
          {isLogin
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>

        <div className="block">
          <button
            type="button"
            onClick={onGuestContinue}
            className="text-synth-secondary hover:text-white text-sm font-medium transition-colors"
          >
            Continue as Guest &rarr;
          </button>
        </div>
      </div>
    </>
  );
}
