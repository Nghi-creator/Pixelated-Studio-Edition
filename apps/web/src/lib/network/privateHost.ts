export function isLocalEngineHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    normalizedHostname,
  );
}

export function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part))
  ) {
    return false;
  }

  const octets = parts.map(Number);
  if (
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

export function isLocalOrLanEngineHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return (
    isLocalEngineHostname(normalizedHostname) ||
    isPrivateIpv4(normalizedHostname) ||
    normalizedHostname.endsWith(".local")
  );
}
