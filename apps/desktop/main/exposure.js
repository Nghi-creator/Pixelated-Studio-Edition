const os = require("os");

function normalizeExposureMode(value) {
  return value === "lan" ? "lan" : "local";
}

function getDockerPublishHost(exposureMode) {
  return exposureMode === "lan" ? "0.0.0.0" : "127.0.0.1";
}

function getAdvertisedEngineUrls(exposureMode) {
  if (exposureMode !== "lan") {
    return ["http://localhost:8080"];
  }

  const urls = [];
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

module.exports = {
  getAdvertisedEngineUrls,
  getDockerPublishHost,
  normalizeExposureMode,
};
