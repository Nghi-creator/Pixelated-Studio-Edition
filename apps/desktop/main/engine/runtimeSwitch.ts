export type RuntimeSwitchClient = {
  role: string;
  sessionId: string | null;
  socketCount: number;
};

export type RuntimeSwitchBlocker = {
  activeClientCount: number;
  activeSessionCount: number;
  code: "runtime_switch_active_session";
  error: string;
};

export function getRuntimeSwitchBlocker(
  clients: RuntimeSwitchClient[],
): RuntimeSwitchBlocker | null {
  const activeSessionClients = clients.filter((client) => {
    return (
      client.role !== "camera" &&
      client.sessionId &&
      client.socketCount > 0
    );
  });

  if (activeSessionClients.length === 0) return null;

  return {
    activeClientCount: activeSessionClients.length,
    activeSessionCount: new Set(
      activeSessionClients.map((client) => client.sessionId),
    ).size,
    code: "runtime_switch_active_session",
    error:
      "A game session is active on this desktop engine. Stop the current stream before switching runtimes.",
  };
}
