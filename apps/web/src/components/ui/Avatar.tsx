import { useMemo, useState } from "react";

type AvatarSize = "sm" | "md" | "lg";

type AvatarProps = {
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
};

const sizeClasses: Record<AvatarSize, string> = {
  lg: "h-24 w-24 text-3xl",
  md: "h-10 w-10 text-sm",
  sm: "h-8 w-8 text-xs",
};

function getInitials(name: string | null | undefined) {
  const normalizedName = name?.trim();
  if (!normalizedName) return "?";

  const parts = normalizedName.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : normalizedName.slice(0, 2);

  return initials.toUpperCase();
}

export function Avatar({
  alt,
  className = "",
  loading = "lazy",
  name,
  size = "md",
  src,
}: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      aria-label={alt || name || "User avatar"}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-synth-border bg-gradient-to-br from-synth-primary to-synth-secondary font-extrabold text-black ${sizeClasses[size]} ${className}`}
    >
      <span aria-hidden={showImage} className="select-none">
        {initials}
      </span>
      {showImage && (
        <img
          alt={alt || name || "User avatar"}
          className="absolute inset-0 h-full w-full object-cover"
          decoding="async"
          loading={loading}
          onError={() => setImageFailed(true)}
          src={src || undefined}
        />
      )}
    </span>
  );
}
