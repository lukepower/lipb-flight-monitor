import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js `output: "standalone"` does not copy `public/` or `.next/static`
 * next to `server.js`. Railway starts with `node server.js` from the
 * standalone folder, so those assets must be copied after `next build`.
 */
const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.warn("prepare-standalone: .next/standalone missing — skip");
  process.exit(0);
}

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});
console.log("prepare-standalone: copied public/ and .next/static into standalone");
