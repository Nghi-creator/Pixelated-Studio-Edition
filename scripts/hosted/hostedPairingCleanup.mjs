export async function restorePairingSnapshot({ captured, pairing }, apiRequest) {
  // A failed inventory is not evidence that the user had no pairing.
  if (!captured) return;
  if (pairing?.engineUrl) {
    await apiRequest("/local-pairings", {
      body: { engineUrl: pairing.engineUrl }, method: "POST",
    });
  } else {
    await apiRequest("/local-pairings/current", { expected: 204, method: "DELETE" });
  }
}
