// scripts/ota-fetch-test.mts
// Verifies OTA connectivity end-to-end: logs in, paginates the full trips
// report, prints a summary of the shape of the data, and writes a CSV so we
// can look at real columns before designing storage/filtering.
//
// Run with:
//   node --env-file=.env scripts/ota-fetch-test.mts [output.csv]
import { writeFileSync } from "node:fs";
import { fetchAllOtaTrips, flattenTripRow, otaConfigFromEnv } from "../src/lib/ota/client.ts";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main() {
  const config = otaConfigFromEnv();
  console.log(`Logging into ${config.baseUrl} as ${config.email}...`);

  const { rows } = await fetchAllOtaTrips(config, {
    onPage: (page, pages, rowsSoFar) => {
      process.stdout.write(`\r  page ${page}/${pages} — ${rowsSoFar} rows so far`.padEnd(60));
    },
  });
  console.log(`\nFetched ${rows.length} rows.`);

  if (rows.length === 0) {
    console.log("No rows returned — nothing to summarize or save.");
    return;
  }

  const flat = rows.map((r) => flattenTripRow(r));
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  console.log(`\nColumns (${headers.length}): ${headers.join(", ")}`);
  console.log(`\nSample row:\n${JSON.stringify(flat[0], null, 2)}`);

  const outPath = process.argv[2] ?? "ota_trips_full.csv";
  const csvLines = [
    headers.map(csvEscape).join(","),
    ...flat.map((row) => headers.map((h) => csvEscape(row[h] ?? "")).join(",")),
  ];
  writeFileSync(outPath, csvLines.join("\n"), "utf-8");
  console.log(`\nSaved -> ${outPath}`);
}

main().catch((err) => {
  console.error("\nOTA fetch failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
