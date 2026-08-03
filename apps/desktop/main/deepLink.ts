export const DESKTOP_PROTOCOL = "pixelated-studio";
export const DESKTOP_OPEN_URL = `${DESKTOP_PROTOCOL}://open`;

export function isSupportedDesktopDeepLink(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === `${DESKTOP_PROTOCOL}:` &&
      url.hostname === "open" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.username === "" &&
      url.password === "" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function findSupportedDesktopDeepLink(argv: string[]) {
  return argv.find(isSupportedDesktopDeepLink) || null;
}
