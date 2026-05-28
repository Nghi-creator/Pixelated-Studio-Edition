const http = require("http");

function waitForEngineHealth(attempts = 30, delayMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const retry = () => {
      if (attempt >= attempts) {
        reject(new Error("Timed out waiting for engine health check."));
        return;
      }

      setTimeout(check, delayMs);
    };

    const check = () => {
      attempt += 1;
      let settled = false;

      const req = http.get("http://127.0.0.1:8080/health", (res) => {
        let body = "";

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const payload = JSON.parse(body);
              if (payload.ok) {
                settled = true;
                resolve(payload);
                return;
              }
            } catch (err) {
              // Fall through to retry with a clearer timeout error later.
            }
          }

          if (!settled) retry();
        });
      });

      req.on("error", () => {
        if (!settled) retry();
      });
      req.setTimeout(1000, () => {
        settled = true;
        req.destroy();
        retry();
      });
    };

    check();
  });
}

module.exports = {
  waitForEngineHealth,
};
