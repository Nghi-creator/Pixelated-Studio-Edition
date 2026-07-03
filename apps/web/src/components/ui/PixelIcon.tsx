type PixelIconName =
  | "admin"
  | "brand"
  | "cartridge"
  | "cube"
  | "engine-off"
  | "engine-on"
  | "empty"
  | "favorites"
  | "gamepad"
  | "logs"
  | "mail"
  | "moderation"
  | "multiplayer"
  | "profile"
  | "publish"
  | "upload"
  | "users"
  | "vault";

type PixelIconProps = React.SVGProps<SVGSVGElement> & {
  name: PixelIconName;
};

const sharedProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "square",
  strokeLinejoin: "miter",
  strokeWidth: 1.8,
  vectorEffect: "non-scaling-stroke",
} as const;

export function PixelIcon({ name, ...props }: PixelIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      {...props}
    >
      {name === "admin" && (
        <>
          <path {...sharedProps} d="M4 5h16v14H4zM4 9h16" />
          <path fill="currentColor" d="M14 11h3v2h-3zM13 15h4v2h-4z" />
        </>
      )}

      {name === "brand" && (
        <>
          <path
            fill="currentColor"
            d="M11 3h2v2h-2zM9 5h2v2H9zM13 5h2v2h-2zM7 7h2v2H7zM15 7h2v2h-2zM5 9h2v2H5zM17 9h2v2h-2zM3 11h2v2H3zM19 11h2v2h-2zM5 13h2v2H5zM17 13h2v2h-2zM7 15h2v2H7zM15 15h2v2h-2zM9 17h2v2H9zM13 17h2v2h-2zM11 19h2v2h-2z"
          />
          <path fill="currentColor" d="M10 9h4v2h-4zM8 11h8v2H8zM10 13h4v2h-4z" opacity="0.3" />
        </>
      )}

      {name === "cartridge" && (
        <>
          <path {...sharedProps} d="M6 5h12v14H6z" />
          <path {...sharedProps} d="M8.5 8h7v4h-7zM9 15h6" />
          <path fill="currentColor" d="M6 5h2v2H6zM16 17h2v2h-2zM10 17h4v1.5h-4z" />
        </>
      )}

      {name === "cube" && (
        <>
          <path {...sharedProps} d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
          <path {...sharedProps} d="M4 7.5 12 12l8-4.5M12 12v9" />
          <path fill="currentColor" d="m8 6.2 4-2.2 4 2.2-4 2.3zM5.8 9.4l5 2.8v5.6l-5-2.8z" opacity="0.24" />
        </>
      )}

      {name === "gamepad" && (
        <>
          <path
            {...sharedProps}
            d="M7 9h10l3 2.5v5L18 19h-3l-2-2h-2l-2 2H6l-2-2.5v-5z"
          />
          <path {...sharedProps} d="M7.5 13h4M9.5 11v4" />
          <path fill="currentColor" d="M15 12h2v2h-2zM17 14h2v2h-2z" />
          <path fill="currentColor" d="M7 9h2v2H7zM15 17h3v2h-3z" opacity="0.28" />
        </>
      )}

      {name === "engine-off" && (
        <>
          <path
            fill="currentColor"
            d="M5 9.5A2.5 2.5 0 0 1 7.5 7H11v10H7.5A2.5 2.5 0 0 1 5 14.5zM15.5 7h1A3.5 3.5 0 0 1 20 10.5v3a3.5 3.5 0 0 1-3.5 3.5h-1z"
          />
          <path
            d="M5 12H1.5v5M11 10h3M11 14h3M20 12h.5a2 2 0 0 0 2-2V7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.2"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}

      {name === "engine-on" && (
        <>
          <path
            d="M5 12H1.5v5M19 12h3.5V7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            fill="currentColor"
            d="M12 7H8.5A3.5 3.5 0 0 0 5 10.5v3A3.5 3.5 0 0 0 8.5 17H12zM12 7h3.5a3.5 3.5 0 0 1 3.5 3.5v3a3.5 3.5 0 0 1-3.5 3.5H12z"
          />
          <path fill="#F38BB4" d="M13 7.5 9.5 12H12l-1 4.5 4.5-6H13z" />
        </>
      )}

      {name === "empty" && (
        <>
          <path {...sharedProps} d="M4 10v9h16v-9M4 10l4-5 4 5 4-5 4 5M4 10h6l2 3 2-3h6" />
          <path fill="currentColor" d="M7 16h10v2H7z" opacity="0.18" />
        </>
      )}

      {name === "favorites" && (
        <>
          <path {...sharedProps} d="M7 5h4v2h2V5h4v2h2v5h-2v3h-2v2h-2v2h-2v-2H9v-2H7v-3H5V7h2z" />
          <path fill="currentColor" d="M7 7h4v3h2V7h4v5h-2v3h-2v2h-2v-2H9v-3H7z" opacity="0.22" />
        </>
      )}

      {name === "logs" && (
        <>
          <path {...sharedProps} d="M6 3h8l4 4v14H6zM14 3v4h4" />
          <path fill="currentColor" d="M8 10h2v2H8zM8 14h2v2H8z" />
          <path {...sharedProps} d="M12 11h4M12 15h4" />
        </>
      )}

      {name === "multiplayer" && (
        <>
          <path {...sharedProps} d="M9 5h6v4H9zM4 14h5v4H4zM15 14h5v4h-5z" />
          <path {...sharedProps} d="M12 9v3M6.5 12H17.5M6.5 12v2M17.5 12v2" />
          <path fill="currentColor" d="M10 6.5h4V8h-4zM5 15.5h3V17H5zM16 15.5h3V17h-3z" />
        </>
      )}

      {name === "profile" && (
        <>
          <circle {...sharedProps} cx="12" cy="8" r="3" />
          <path {...sharedProps} d="M6 19v-2.5c0-2.5 2.5-4.5 6-4.5s6 2 6 4.5V19z" />
          <path fill="currentColor" d="M9 15h6v2H9z" opacity="0.24" />
        </>
      )}

      {name === "mail" && (
        <>
          <path {...sharedProps} d="M4 7h16v11H4z" />
          <path {...sharedProps} d="M4 8l8 6 8-6" />
          <path fill="currentColor" d="M6 9h3v2H6zM15 9h3v2h-3z" opacity="0.24" />
        </>
      )}

      {name === "moderation" && (
        <>
          <path {...sharedProps} d="M12 3 21 20H3z" />
          <path fill="currentColor" d="M11 8h2v6h-2zM11 16h2v2h-2z" />
        </>
      )}

      {name === "publish" && (
        <>
          <path fill="currentColor" d="M12 5l5 6h-3v5h-4v-5H7z" />
          <path {...sharedProps} d="M5 16v4h14v-4" />
        </>
      )}

      {name === "upload" && (
        <>
          <path fill="currentColor" d="M12 5l5 6h-3v5h-4v-5H7z" />
          <path {...sharedProps} d="M5 16v4h14v-4" />
        </>
      )}

      {name === "users" && (
        <>
          <circle {...sharedProps} cx="9" cy="8" r="2.5" />
          <circle {...sharedProps} cx="16.5" cy="9" r="2" />
          <path {...sharedProps} d="M4.5 19v-2c0-2.7 2-4.5 4.5-4.5s4.5 1.8 4.5 4.5v2M14 13.5c3.2-.6 5.5 1.2 5.5 3.8V19" />
          <path fill="currentColor" d="M7 16h4v2H7z" opacity="0.3" />
        </>
      )}

      {name === "vault" && (
        <>
          <path fill="currentColor" d="M12 5l5 6h-3v5h-4v-5H7z" />
          <path {...sharedProps} d="M5 16v4h14v-4" />
        </>
      )}
    </svg>
  );
}
