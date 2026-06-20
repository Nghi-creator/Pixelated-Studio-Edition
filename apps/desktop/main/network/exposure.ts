import os from "os";

export type ExposureMode = "local" | "lan";

export function normalizeExposureMode(value: unknown): ExposureMode {
  return value === "lan" ? "lan" : "local";
}

export function getDockerPublishHost(exposureMode: ExposureMode) {
  return exposureMode === "lan" ? "0.0.0.0" : "127.0.0.1";
}

export function getAdvertisedEngineUrls(exposureMode: ExposureMode) {
  if (exposureMode !== "lan") {
    return ["http://localhost:8080"];
  }

  const urls: string[] = [];
  const interfaces = os.networkInterfaces();

  Object.values(interfaces).forEach((entries = []) => {
    entries.forEach((entry) => {
      if (
        entry &&
        entry.family === "IPv4" &&
        !entry.internal &&
        entry.address
      ) {
        urls.push(`http://${entry.address}:8080`);
      }
    });
  });

  return urls.length > 0 ? urls : ["http://<your-lan-ip>:8080"];
}

export function getLanIpv4Addresses() {
  const addresses: string[] = [];
  const interfaces = os.networkInterfaces();

  Object.values(interfaces).forEach((entries = []) => {
    entries.forEach((entry) => {
      if (
        entry &&
        entry.family === "IPv4" &&
        !entry.internal &&
        entry.address
      ) {
        addresses.push(entry.address);
      }
    });
  });

  return addresses;
}

export function getAdvertisedCompanionUrls(exposureMode: ExposureMode, port: number) {
  if (exposureMode !== "lan") return [];

  const urls = getLanIpv4Addresses().map(
    (address) => `https://${address}:${port}`,
  );

  return urls.length > 0 ? urls : [`https://<your-lan-ip>:${port}`];
}
