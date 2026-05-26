const fs = require("fs");
const https = require("https");

function removeFileIfExists(filePath) {
  fs.unlink(filePath, () => {});
}

function createCloudRomDownloader(options) {
  const { allowedRomHosts, maxCloudRomSizeBytes, timeoutMs } = options;

  function validateCloudRomUrl(romUrl) {
    let parsedUrl;

    try {
      parsedUrl = new URL(romUrl);
    } catch (err) {
      throw new Error("Invalid cloud ROM URL");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error("Cloud ROM URLs must use HTTPS");
    }

    if (
      allowedRomHosts.length > 0 &&
      !allowedRomHosts.includes(parsedUrl.hostname.toLowerCase())
    ) {
      throw new Error(`Cloud ROM host is not allowed: ${parsedUrl.hostname}`);
    }

    return parsedUrl;
  }

  function downloadCloudRom(romUrl, destinationPath) {
    const parsedUrl = validateCloudRomUrl(romUrl);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destinationPath);
      let downloadedBytes = 0;
      let settled = false;

      const fail = (err) => {
        if (settled) return;
        settled = true;
        file.destroy();
        removeFileIfExists(destinationPath);
        reject(err);
      };

      const request = https.get(parsedUrl, (response) => {
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

        response.on("data", (chunk) => {
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
          file.close(resolve);
        });

        response.pipe(file);
      });

      request.setTimeout(timeoutMs, () => {
        request.destroy(new Error("Cloud ROM download timed out"));
      });
      request.on("error", fail);
    });
  }

  return {
    downloadCloudRom,
    validateCloudRomUrl,
  };
}

module.exports = {
  createCloudRomDownloader,
  removeFileIfExists,
};
