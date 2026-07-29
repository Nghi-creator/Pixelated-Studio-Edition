import { pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";
import { env } from "./config/env.js";

export { buildServer } from "./app.js";

type SignalProcess = Pick<
  NodeJS.Process,
  "exitCode" | "off" | "once"
>;

export function installGracefulShutdown(
  app: FastifyInstance,
  processTarget: SignalProcess = process,
) {
  let closing = false;

  const close = async (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "Shutting down Pixelated API");
    try {
      await app.close();
    } catch (err) {
      processTarget.exitCode = 1;
      app.log.error(err, "Failed to shut down Pixelated API cleanly");
    }
  };

  const onSigint = () => void close("SIGINT");
  const onSigterm = () => void close("SIGTERM");
  processTarget.once("SIGINT", onSigint);
  processTarget.once("SIGTERM", onSigterm);

  return () => {
    processTarget.off("SIGINT", onSigint);
    processTarget.off("SIGTERM", onSigterm);
  };
}

export async function startServer() {
  const app = await buildServer();
  installGracefulShutdown(app);
  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`Pixelated API listening on http://${env.HOST}:${env.PORT}`);
    return app;
  } catch (err) {
    app.log.error(err, "Failed to start Pixelated API");
    process.exitCode = 1;
    await app.close();
    return null;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === entryUrl) {
  await startServer();
}
