import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// This is a one-shot build. The CLI's watcher dependency is unnecessary here.
const root = fileURLToPath(new URL("../", import.meta.url));
const from = path.join(root, "styles.input.css");
const to = path.join(root, "styles.css");
const result = await postcss([
  tailwindcss({ base: root, optimize: { minify: true } }),
]).process(await fs.readFile(from, "utf8"), { from, to, map: false });
for (const warning of result.warnings()) console.warn(warning.toString());
await fs.writeFile(to, result.css);
