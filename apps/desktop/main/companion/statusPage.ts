import type { ServerResponse } from "http";

export function getCompanionStatusPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Pixelated Companion</title>
    <style>
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { align-items: center; background: #100c20; color: #f7f2ff; display: flex; justify-content: center; margin: 0; min-height: 100vh; padding: 24px; }
      main { background: #181228; border: 1px solid #40325e; border-radius: 16px; box-shadow: 0 20px 70px #0008; max-width: 520px; padding: 32px; text-align: center; }
      .dot { background: #4ade80; border-radius: 999px; box-shadow: 0 0 18px #4ade8099; display: inline-block; height: 12px; margin-right: 8px; width: 12px; }
      h1 { font-size: 26px; margin: 0 0 12px; }
      p { color: #b9aecb; line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1><span class="dot"></span>Companion is running</h1>
      <p>This secure local service connects the hosted Pixelated web app to the desktop engine. You can close this tab and return to the hosted join page.</p>
    </main>
  </body>
</html>`;
}

export function serveCompanionStatus(res: ServerResponse) {
  res.writeHead(200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
  });
  res.end(getCompanionStatusPage());
}
