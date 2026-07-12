// src/lib/shift-import.ts
// Parses and applies an uploaded weekly shift schedule (CSV or JSON) from the
// external scheduler system. OroDashboard doesn't generate schedules — it
// only imports and displays them, so this is deliberately a thin, forgiving
// parser: one bad row shouldn't sink the rest of the batch.
import { prisma } from "@/lib/prisma";
import { shiftImportRowSchema } from "@/lib/schemas/shift";

export type ImportRowError = { row: number; message: string };

export type ImportResult = {
  rowCount: number;
  successCount: number;
  errorCount: number;
  errors: ImportRowError[];
};

// Splits one CSV line respecting double-quoted fields (with "" as an escaped
// quote), which is the only quoting convention spreadsheet exports use.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

function parseJson(content: string): Record<string, string>[] {
  const parsed = JSON.parse(content);
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  if (!Array.isArray(rows)) throw new Error("Expected a JSON array of rows (or { rows: [...] }).");
  return rows;
}

export function parseImportContent(fileName: string, content: string): Record<string, string>[] {
  const isJson = fileName.toLowerCase().endsWith(".json") || content.trim().startsWith("[") || content.trim().startsWith("{");
  return isJson ? parseJson(content) : parseCsv(content);
}

export async function applyShiftImport(
  fileName: string,
  rawRows: Record<string, string>[],
  importedBy: string
): Promise<{ result: ImportResult; batchId: string }> {
  const errors: ImportRowError[] = [];
  let successCount = 0;

  // Resolve every distinct code up front instead of one query per row.
  const employeeCodes = new Set<string>();
  const stationCodes = new Set<string>();
  const posMachineCodes = new Set<string>();
  const parsedRows: { rowNum: number; data: ReturnType<typeof shiftImportRowSchema.parse> }[] = [];

  rawRows.forEach((raw, i) => {
    const rowNum = i + 2; // header is row 1
    // Blank CSV cells parse to "" — treat as absent so optional fields like
    // pos_machine_code don't fail min-length validation.
    const cleaned = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v])
    );
    const parsed = shiftImportRowSchema.safeParse(cleaned);
    if (!parsed.success) {
      errors.push({ row: rowNum, message: parsed.error.issues.map((e) => e.message).join("; ") });
      return;
    }
    parsedRows.push({ rowNum, data: parsed.data });
    employeeCodes.add(parsed.data.employee_code);
    stationCodes.add(parsed.data.station_code);
    if (parsed.data.pos_machine_code) posMachineCodes.add(parsed.data.pos_machine_code);
  });

  const [employees, stations, posMachines] = await Promise.all([
    prisma.employee.findMany({ where: { code: { in: [...employeeCodes] } }, select: { id: true, code: true, isDeleted: true } }),
    prisma.station.findMany({ where: { code: { in: [...stationCodes] } }, select: { id: true, code: true, isDeleted: true } }),
    posMachineCodes.size
      ? prisma.posMachine.findMany({ where: { code: { in: [...posMachineCodes] } }, select: { id: true, code: true, isDeleted: true } })
      : Promise.resolve([]),
  ]);
  const employeeByCode = new Map(employees.map((e) => [e.code, e]));
  const stationByCode = new Map(stations.map((s) => [s.code, s]));
  const posMachineByCode = new Map(posMachines.map((p) => [p.code, p]));

  const batch = await prisma.shiftImportBatch.create({
    data: { fileName, importedBy, rowCount: rawRows.length, successCount: 0, errorCount: 0 },
  });

  for (const { rowNum, data } of parsedRows) {
    const employee = employeeByCode.get(data.employee_code);
    const station = stationByCode.get(data.station_code);
    const posMachine = data.pos_machine_code ? posMachineByCode.get(data.pos_machine_code) : undefined;

    if (!employee || employee.isDeleted) {
      errors.push({ row: rowNum, message: `Unknown or deleted employee_code "${data.employee_code}".` });
      continue;
    }
    if (!station || station.isDeleted) {
      errors.push({ row: rowNum, message: `Unknown or deleted station_code "${data.station_code}".` });
      continue;
    }
    if (data.pos_machine_code && (!posMachine || posMachine.isDeleted)) {
      errors.push({ row: rowNum, message: `Unknown or decommissioned pos_machine_code "${data.pos_machine_code}".` });
      continue;
    }

    try {
      await prisma.shiftAssignment.upsert({
        where: { employeeId_date_shiftType: { employeeId: employee.id, date: new Date(data.date), shiftType: data.shift } },
        create: {
          employeeId: employee.id,
          stationId: station.id,
          date: new Date(data.date),
          shiftType: data.shift,
          role: data.role,
          posMachineId: posMachine?.id,
          source: "import",
          importBatchId: batch.id,
          isDeleted: false,
          deletedAt: null,
        },
        update: {
          stationId: station.id,
          role: data.role,
          posMachineId: posMachine?.id ?? null,
          source: "import",
          importBatchId: batch.id,
          isDeleted: false,
          deletedAt: null,
        },
      });
      successCount++;
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : "Failed to save row." });
    }
  }

  const result: ImportResult = { rowCount: rawRows.length, successCount, errorCount: errors.length, errors };
  await prisma.shiftImportBatch.update({
    where: { id: batch.id },
    data: { successCount, errorCount: errors.length, errors: errors as unknown as object },
  });

  return { result, batchId: batch.id };
}
