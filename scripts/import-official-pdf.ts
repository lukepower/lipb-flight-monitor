/**
 * Import a SkyAlps "Voli schedulati …" PDF into data/official-schedules/YYYY-MM.json
 * and copy the PDF to public/schedules/YYYY-MM.pdf.
 *
 * Usage:
 *   npm run import:official -- "C:\\path\\to\\Voli schedulati ottobre.pdf"
 *   npm run import:official -- "…pdf" --month 2026-10
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  officialSchedulesDir,
  parseOfficialScheduleText,
} from "../src/lib/official-schedule";
import { parseCalendarMonth } from "../src/lib/history";

async function extractPdfText(pdfPath: string): Promise<string> {
  const bytes = new Uint8Array(readFileSync(pdfPath));
  const doc = await getDocument({
    data: bytes,
    useSystemFonts: true,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean);
    pages.push(strings.join("\n"));
  }
  return pages.join("\n");
}

function parseArgs(argv: string[]): {
  pdfPath: string | null;
  month: string | null;
} {
  let pdfPath: string | null = null;
  let month: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--month") {
      month = argv[++i] ?? null;
      continue;
    }
    if (!a.startsWith("-") && !pdfPath) {
      pdfPath = a;
    }
  }
  return { pdfPath, month };
}

function inferYearMonth(
  explicit: string | null,
  sourceName: string,
  firstDate: string | null,
): { year: number; month?: string } {
  if (explicit) {
    const m = parseCalendarMonth(explicit);
    if (!m) throw new Error(`invalid --month ${explicit}`);
    return { year: Number(m.slice(0, 4)), month: m };
  }
  // Filename hints: "ottobre", "2026-10", etc.
  const lower = sourceName.toLowerCase();
  const ym = lower.match(/(20\d{2})-(\d{2})/);
  if (ym) {
    return { year: Number(ym[1]), month: `${ym[1]}-${ym[2]}` };
  }
  if (firstDate) {
    return { year: Number(firstDate.slice(0, 4)) };
  }
  // Italian month names in filename → assume current season year from cwd data
  const italian: Record<string, number> = {
    gennaio: 1,
    febbraio: 2,
    marzo: 3,
    aprile: 4,
    maggio: 5,
    giugno: 6,
    luglio: 7,
    agosto: 8,
    settembre: 9,
    ottobre: 10,
    novembre: 11,
    dicembre: 12,
  };
  for (const [name, mon] of Object.entries(italian)) {
    if (lower.includes(name)) {
      // Default season year for this hangar board
      const year = 2026;
      return {
        year,
        month: `${year}-${String(mon).padStart(2, "0")}`,
      };
    }
  }
  throw new Error(
    "could not infer year/month — pass --month YYYY-MM explicitly",
  );
}

async function main() {
  const { pdfPath: rawPath, month: monthArg } = parseArgs(process.argv.slice(2));
  if (!rawPath) {
    console.error(
      'Usage: npm run import:official -- "C:\\\\path\\\\to\\\\Voli schedulati.pdf" [--month 2026-10]',
    );
    process.exit(1);
  }

  const pdfPath = resolve(rawPath);
  const source = basename(pdfPath);
  const inferred = inferYearMonth(monthArg, source, null);

  const text = await extractPdfText(pdfPath);
  const file = parseOfficialScheduleText(text, {
    year: inferred.year,
    source,
    month: inferred.month,
  });

  const outDir = officialSchedulesDir();
  mkdirSync(outDir, { recursive: true });
  const outJson = resolve(outDir, `${file.month}.json`);
  writeFileSync(outJson, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const publicDir = resolve(process.cwd(), "public/schedules");
  mkdirSync(publicDir, { recursive: true });
  const outPdf = resolve(publicDir, `${file.month}.pdf`);
  copyFileSync(pdfPath, outPdf);

  console.log(`wrote ${outJson}`);
  console.log(`wrote ${outPdf}`);
  console.log(
    `month ${file.month}: ${file.movements.length} legs (${file.from} → ${file.to})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
