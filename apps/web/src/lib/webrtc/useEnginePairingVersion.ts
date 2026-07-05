import { useEffect, useState } from "react";
import { ENGINE_PAIRING_EVENT } from "../engine/engineAuth";

export function useEnginePairingVersion() {
  const [pairingVersion, setPairingVersion] = useState(0);

  useEffect(() => {
    const handlePairingChange = () =>
      setPairingVersion((currentVersion) => currentVersion + 1);

    window.addEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
    return () =>
      window.removeEventListener(ENGINE_PAIRING_EVENT, handlePairingChange);
  }, []);

  return pairingVersion;
}
