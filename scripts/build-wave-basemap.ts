/**
 * Stitch OpenTopoMap tiles cropped EXACTLY to ALPS_BBOX (Web Mercator).
 *
 * Sharp ignores negative composite offsets, so we build a whole-tile mosaic
 * then extract the bbox pixel rectangle (positive crop only). Crop math is
 * shared with runtime via `basemapProjectionForBbox`.
 *
 *   npm run build:wave-basemap
 *   npm run build:wave-basemap -- --debug
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALPS_BBOX } from "../src/lib/constants";
import {
  basemapProjectionForBbox,
  projectLonLat,
} from "../src/lib/web-mercator";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const Z = 7;
const TILE_PX = 256;
const ATTRIBUTION =
  "Map © OpenTopoMap (CC-BY-SA) · © OpenStreetMap contributors · SRTM";
const STATIC_URL = "/maps/alps-wave-basemap.jpg";

const LANDMARKS = [
  { name: "LIPB", lat: 46.4603, lon: 11.3264 },
  { name: "Innsbruck", lat: 47.2692, lon: 11.4041 },
  { name: "Zürich", lat: 47.3769, lon: 8.5417 },
  { name: "Milano", lat: 45.4642, lon: 9.19 },
] as const;

function tileUrl(z: number, x: number, y: number): string {
  const host = ["a", "b", "c"][Math.abs(x + y) % 3]!;
  return `https://${host}.tile.opentopomap.org/${z}/${x}/${y}.png`;
}

async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    console.error("Install sharp first: npm install --no-save sharp");
    process.exit(1);
  }
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  const url = tileUrl(z, x, y);
  const res = await fetch(url, {
    headers: { "User-Agent": "lipb-flight-monitor-basemap-builder/1.0" },
  });
  if (!res.ok) throw new Error(`Tile ${z}/${x}/${y} HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const debug = process.argv.includes("--debug");
  const sharp = await loadSharp();
  const bbox = {
    lamin: ALPS_BBOX.lamin,
    lamax: ALPS_BBOX.lamax,
    lomin: ALPS_BBOX.lomin,
    lomax: ALPS_BBOX.lomax,
  };
  const proj = basemapProjectionForBbox(bbox, Z, TILE_PX);
  const { mosaicX0: x0, mosaicY0: y0, mosaicW, mosaicH, cropLeft, cropTop, width, height } =
    proj;
  const x1 = x0 + mosaicW / TILE_PX - 1;
  const y1 = y0 + mosaicH / TILE_PX - 1;

  console.log(
    `Basemap ${width}×${height}px · mosaic ${mosaicW}×${mosaicH} · crop (${cropLeft},${cropTop}) · origin (${proj.originX.toFixed(6)}, ${proj.originY.toFixed(6)})`,
  );

  if (
    cropLeft < 0 ||
    cropTop < 0 ||
    cropLeft + width > mosaicW ||
    cropTop + height > mosaicH
  ) {
    throw new Error(
      `Crop out of mosaic bounds: crop=(${cropLeft},${cropTop}) size=${width}×${height} mosaic=${mosaicW}×${mosaicH}`,
    );
  }

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      process.stdout.write(`  tile ${x},${y}   \r`);
      const buf = await fetchTile(Z, x, y);
      composites.push({
        input: buf,
        left: (x - x0) * TILE_PX,
        top: (y - y0) * TILE_PX,
      });
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  console.log("\nCompositing mosaic + extracting bbox…");

  // Two-step required: sharp may reorder extract before composite in one
  // pipeline, which stamps whole northern tiles onto the cropped canvas.
  const mosaicBuf = await sharp({
    create: {
      width: mosaicW,
      height: mosaicH,
      channels: 3,
      background: { r: 30, g: 40, b: 40 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const jpgBuf = await sharp(mosaicBuf)
    .extract({ left: cropLeft, top: cropTop, width, height })
    .modulate({ brightness: 0.55, saturation: 0.35 })
    .jpeg({ quality: 80 })
    .toBuffer();

  const outDir = join(root, "public", "maps");
  mkdirSync(outDir, { recursive: true });
  const outJpg = join(outDir, "alps-wave-basemap.jpg");
  writeFileSync(outJpg, jpgBuf);

  const meta = {
    z: proj.z,
    tilePx: proj.tilePx,
    width: proj.width,
    height: proj.height,
    originX: proj.originX,
    originY: proj.originY,
    projection: "web-mercator" as const,
    bbox,
    attribution: ATTRIBUTION,
    staticUrl: STATIC_URL,
  };
  const metaJson = `${JSON.stringify(meta, null, 2)}\n`;
  writeFileSync(join(outDir, "alps-wave-basemap.json"), metaJson);
  writeFileSync(join(root, "src", "lib", "wave-basemap-meta.json"), metaJson);

  if (debug) {
    const svgMarks = LANDMARKS.map((m) => {
      const p = projectLonLat(m.lon, m.lat, proj);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" fill="lime" stroke="black" stroke-width="1.5"/><text x="${(p.x + 8).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" font-size="12" font-family="monospace" fill="lime" stroke="black" stroke-width="2" paint-order="stroke">${m.name}</text>`;
    }).join("");
    const overlay = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${svgMarks}</svg>`,
    );
    const debugPng = await sharp(jpgBuf)
      .composite([{ input: overlay, left: 0, top: 0 }])
      .png()
      .toBuffer();
    writeFileSync(join(outDir, "alps-wave-basemap-debug.png"), debugPng);
    console.log("Debug overlay → public/maps/alps-wave-basemap-debug.png");
  }

  console.log(`Wrote ${outJpg} (${jpgBuf.length} bytes)`);
  for (const m of LANDMARKS) {
    const p = projectLonLat(m.lon, m.lat, proj);
    console.log(
      `  ${m.name.padEnd(10)} → (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
