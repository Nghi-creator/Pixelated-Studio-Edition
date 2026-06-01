import fs from "fs";
import path from "path";

const webAppDir = path.resolve(process.cwd(), "../web");
const webDistDir = path.join(webAppDir, "dist");
const webIndexPath = path.join(webDistDir, "index.html");

if (!fs.existsSync(webIndexPath)) {
  throw new Error(`Web build did not produce ${webIndexPath}`);
}

console.log(`Prepared bundled web assets from ${webDistDir}`);
