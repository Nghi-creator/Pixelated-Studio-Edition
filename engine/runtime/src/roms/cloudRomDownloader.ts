import fs from "fs";
import https from "https";
import net from "net";
import { promises as dns } from "dns";
import { validateGameArtifact } from "./artifactValidation";

type ResolvedAddress = { address: string; family: number };
type ResolveHost = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ResolvedAddress[]>;

type CloudRomDownloaderOptions = {
  allowedRomHosts: string[];
  maxCloudRomSizeBytes: number;
  timeoutMs: number;
  resolveHost?: ResolveHost;
  request?: typeof https.get;
};

type DownloadValidationOptions = {
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
  runtimeId: string;
};

const blockedAddresses = new net.BlockList();
[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(([address, prefix]) =>
  blockedAddresses.addSubnet(address as string, prefix as number, "ipv4"),
);
[
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
].forEach(([address, prefix]) =>
  blockedAddresses.addSubnet(address as string, prefix as number, "ipv6"),
);

export function isPublicNetworkAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blockedAddresses.check(address, "ipv4");
  if (family === 6) {
    const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return isPublicNetworkAddress(mappedIpv4[1]);
    return !blockedAddresses.check(address, "ipv6");
  }
  return false;
}

export function removeFileIfExists(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

export function createCloudRomDownloader(options: CloudRomDownloaderOptions) {
  const {
    allowedRomHosts,
    maxCloudRomSizeBytes,
    timeoutMs,
    resolveHost = dns.lookup as ResolveHost,
    request: get = https.get,
  } = options;
  const normalizedAllowedHosts = new Set(
    allowedRomHosts.map((host) => host.trim().toLowerCase()).filter(Boolean),
  );

  function validateCloudRomUrl(romUrl: string): URL {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(romUrl);
    } catch (err) {
      throw new Error("Invalid cloud ROM URL");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Cloud ROM URLs must use HTTPS");
    }

    if (normalizedAllowedHosts.size === 0) {
      throw new Error(
        "Cloud ROM downloads are disabled until PIXELATED_ALLOWED_ROM_HOSTS is configured",
      );
    }

    if (!normalizedAllowedHosts.has(parsedUrl.hostname.toLowerCase())) {
      throw new Error(`Cloud ROM host is not allowed: ${parsedUrl.hostname}`);
    }

    return parsedUrl;
  }

  async function downloadCloudRom(
    romUrl: string,
    destinationPath: string,
    validation: DownloadValidationOptions,
  ): Promise<void> {
    const parsedUrl = validateCloudRomUrl(romUrl);
    if (
      typeof validation.expectedSizeBytes === "number" &&
      Number.isFinite(validation.expectedSizeBytes) &&
      validation.expectedSizeBytes > maxCloudRomSizeBytes
    ) {
      throw new Error(
        `Cloud ROM is too large. Max size is ${maxCloudRomSizeBytes} bytes.`,
      );
    }

    const addresses = await resolveHost(parsedUrl.hostname, {
      all: true,
      verbatim: true,
    });
    const publicAddresses = addresses.filter(({ address }) =>
      isPublicNetworkAddress(address),
    );
    if (publicAddresses.length !== addresses.length || publicAddresses.length === 0) {
      throw new Error("Cloud ROM host resolves to a non-public network address");
    }

    // Pin the request to the address we validated so DNS cannot be rebound between
    // validation and connection establishment. TLS still verifies the URL hostname.
    const pinnedAddress = publicAddresses[0];

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destinationPath);
      let downloadedBytes = 0;
      let settled = false;
      const deadline = setTimeout(() => {
        request.destroy(new Error("Cloud ROM download deadline exceeded"));
      }, timeoutMs);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        file.destroy();
        removeFileIfExists(destinationPath);
        reject(err);
      };

      const request = get(
        parsedUrl,
        {
          lookup: (_hostname, _options, callback) => {
            callback(null, pinnedAddress.address, pinnedAddress.family);
          },
        },
        (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          fail(
            new Error(
              `Failed to download cloud ROM: status ${response.statusCode}`,
            ),
          );
          return;
        }

        const contentLength = Number(response.headers["content-length"] || 0);
        if (contentLength > maxCloudRomSizeBytes) {
          response.resume();
          fail(
            new Error(
              `Cloud ROM is too large. Max size is ${maxCloudRomSizeBytes} bytes.`,
            ),
          );
          return;
        }

        response.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxCloudRomSizeBytes) {
            response.destroy(
              new Error(
                `Cloud ROM exceeded max size of ${maxCloudRomSizeBytes} bytes.`,
              ),
            );
          }
        });

        response.on("error", fail);
        file.on("error", fail);
        file.on("finish", () => {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          file.close(() => {
            try {
              validateGameArtifact(destinationPath, {
                ...validation,
                fileLabel: "Cloud ROM",
              });
              resolve();
            } catch (err) {
              removeFileIfExists(destinationPath);
              reject(err);
            }
          });
        });

        response.pipe(file);
        },
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error("Cloud ROM download stalled"));
      });
      request.on("error", fail);
    });
  }

  return {
    downloadCloudRom,
    validateCloudRomUrl,
  };
}
