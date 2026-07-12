export const pulseAudioArgs = [
  "-D",
  "--system",
  "--disallow-exit",
  "--disable-shm=yes",
  "--load=module-native-protocol-tcp auth-anonymous=1",
];

export const xdotoolArgs = (action: "keydown" | "keyup", linuxKey: string) => [
  action,
  linuxKey,
];
