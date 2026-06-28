import { PixelIcon } from "../ui/PixelIcon";

type GameArtworkFallbackProps = {
  className?: string;
  label?: string;
  title: string;
  variant?: "backdrop" | "poster";
};

function initialsFor(title: string) {
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "PX";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function GameArtworkFallback({
  className = "",
  label = "Catalog game",
  title,
  variant = "poster",
}: GameArtworkFallbackProps) {
  const compact = variant === "poster";

  return (
    <div
      aria-label={`${title} placeholder artwork`}
      className={`relative flex h-full w-full overflow-hidden bg-[#14070D] text-white ${className}`}
      role="img"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(216,164,181,0.36),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(155,0,72,0.42),transparent_30%),linear-gradient(145deg,#351522_0%,#10070D_48%,#050505_100%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:18px_18px]" />

      <div
        className={`relative z-10 flex h-full w-full flex-col ${
          compact ? "items-center justify-center p-6 text-center" : "justify-end p-8 md:p-10"
        }`}
      >
        <div
          className={`mb-4 inline-flex items-center justify-center rounded-2xl border border-synth-border/80 bg-synth-surface/70 shadow-card backdrop-blur-sm ${
            compact ? "h-20 w-20" : "h-24 w-24"
          }`}
        >
          <span className="absolute font-black tracking-tight text-synth-secondary/20">
            {initialsFor(title)}
          </span>
          <PixelIcon
            className={`relative text-white/90 ${compact ? "h-10 w-10" : "h-12 w-12"}`}
            name="gamepad"
          />
        </div>

        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-synth-secondary">
          {label}
        </p>
        <p
          className={`max-w-full font-black leading-tight text-white ${
            compact ? "line-clamp-2 text-xl" : "max-w-2xl text-3xl md:text-5xl"
          }`}
        >
          {title}
        </p>
      </div>
    </div>
  );
}
