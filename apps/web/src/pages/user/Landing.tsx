import {
  ArrowRight,
  Cloud,
  Download,
  Gamepad2,
  MessageCircle,
  MonitorUp,
  Network,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PixelIcon } from "../../components/ui/PixelIcon";

const DESKTOP_RELEASE_URL =
  "https://github.com/Nghi-creator/Pixelated-Studio-Edition/releases/latest";

const featureCards = [
  {
    icon: <Cloud className="h-5 w-5" />,
    title: "Cloud catalog",
    body: "Browse hosted games, search the library, open a title, and keep favorites synced to your account.",
    accent: "text-sky-300",
  },
  {
    icon: <PixelIcon className="h-5 w-5" name="publish" />,
    title: "Local Vault",
    body: "Upload your own NES files to the local engine volume and play them without publishing anything online.",
    accent: "text-emerald-300",
  },
  {
    icon: <Network className="h-5 w-5" />,
    title: "LAN multiplayer",
    body: "Host from the desktop app, share an invite, and let guests join through the companion without exposing raw engine tokens.",
    accent: "text-amber-300",
  },
  {
    icon: <PixelIcon className="h-5 w-5" name="mail" />,
    title: "Game submissions",
    body: "Signed-in creators can submit games and rights details for review before anything becomes public.",
    accent: "text-fuchsia-300",
  },
  {
    icon: <MessageCircle className="h-5 w-5" />,
    title: "Social features",
    body: "Comment on games, like what you enjoy, report abuse, block users, and keep your account space clean.",
    accent: "text-rose-300",
  },
];

const engineSteps = [
  "Desktop starts Docker and launches the local engine runtime.",
  "The engine runs the emulator, display capture, audio bridge, and Socket.IO signaling.",
  "This website pairs with your desktop through a local token or HTTPS companion invite.",
  "When you press play, the browser receives WebRTC video and sends input back to the engine.",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-synth-bg text-white">
      <section className="pixel-animated-backdrop border-b border-synth-border/70">
        <div className="mx-auto flex min-h-[460px] max-w-7xl items-center px-6 py-12 sm:min-h-[500px] sm:px-10 lg:min-h-[520px] lg:px-14 xl:px-8">
          <div className="relative z-10 max-w-5xl">
            <h1 className="pixel-title-glow text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl xl:whitespace-nowrap">
              Pixelated Studio Edition
            </h1>
            <p className="mt-4 max-w-4xl text-xl font-extrabold leading-8 text-white sm:text-2xl">
              Built for quick play, local creation, and stream research.
            </p>
            <p className="mt-3 max-w-4xl text-base leading-7 text-gray-200 sm:text-lg">
              Pixelated is a web front door for fast 8-bit sessions, a local
              tool for developers who want to test vault builds or submit games
              for review, and a research surface for measuring browser gameplay
              streams. Inside the gameplay screen, stream statistics help
              compare playback quality, input behavior, and connection health
              while the desktop engine handles the emulator work.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-primary px-5 font-extrabold text-white transition-colors hover:bg-synth-primary-hover"
                to="/home"
              >
                <Gamepad2 className="h-5 w-5" />
                Go to Home Page
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-surface px-5 font-extrabold text-white transition-colors hover:bg-synth-elevated"
                href={DESKTOP_RELEASE_URL}
                rel="noreferrer"
                target="_blank"
              >
                <Download className="h-5 w-5" />
                Download Desktop App
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-synth-border/60 bg-[#090909] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 overflow-visible sm:grid-cols-2 lg:grid-cols-5">
          {featureCards.map((feature) => (
            <article
              className="feature-pop-card rounded-lg border border-synth-border bg-synth-surface/70 p-5 shadow-card"
              key={feature.title}
            >
              <div className={`mb-4 inline-flex ${feature.accent}`}>
                {feature.icon}
              </div>
              <h2 className="text-lg font-extrabold text-white">
                {feature.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-gray-300">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              The desktop orchestrator + lightweight browser infrastructure
            </h2>
            <p className="mt-5 text-base leading-7 text-gray-300">
              Pixelated uses the web app for browsing, controls, accounts, and
              multiplayer coordination. The desktop app owns Docker, emulator
              startup, local storage, companion invites, and the WebRTC media
              stream.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-surface px-4 font-bold text-white transition-colors hover:bg-synth-elevated"
                to="/engine"
              >
                <MonitorUp className="h-5 w-5" />
                Connect Engine
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-synth-border bg-synth-bg px-4 font-bold text-white transition-colors hover:bg-synth-surface"
                to="/multiplayer"
              >
                <Network className="h-5 w-5" />
                Multiplayer
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            {engineSteps.map((step, index) => (
              <div
                className="flex gap-4 rounded-lg border border-synth-border bg-[#120D10] p-4"
                key={step}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-synth-border bg-synth-surface text-sm font-extrabold text-synth-secondary">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-6 text-gray-200">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
