import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js `output: "standalone"` does not copy `public/`, `.next/static`,
 * or runtime-read JSON next to `server.js`. Docker/Railway start from the
 * standalone folder (or copy it to /app), so those assets must be copied
 * after `next build`.
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

const officialSchedules = join(root, "data", "official-schedules");
if (existsSync(officialSchedules)) {
  cpSync(officialSchedules, join(standalone, "data", "official-schedules"), {
    recursive: true,
  });
}

console.log(
  "prepare-standalone: copied public/, .next/static, and data/official-schedules into standalone",
);
