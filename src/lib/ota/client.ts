// src/lib/ota/client.ts
// Client for the OTA (company.ota.gov.et) sales-report source system —
// TS port of the original ota_scraper.py. Logs in as a company user and
// paginates the trips report. No credentials are hardcoded here; they come
// from OTA_BASE_URL / OTA_EMAIL / OTA_PASSWORD / OTA_COMPANY_ID.

export type OtaConfig = {
  baseUrl: string;
  email: string;
  password: string;
  companyId: string;
};

export function otaConfigFromEnv(): OtaConfig {
  const baseUrl = process.env.OTA_BASE_URL;
  const email = process.env.OTA_EMAIL;
  const password = process.env.OTA_PASSWORD;
  const companyId = process.env.OTA_COMPANY_ID;
  if (!baseUrl || !email || !password || !companyId) {
    throw new Error(
      "Missing OTA_BASE_URL / OTA_EMAIL / OTA_PASSWORD / OTA_COMPANY_ID environment variables."
    );
  }
  return { baseUrl, email, password, companyId };
}

type OtaLoginResponse = {
  data?: {
    token?: string;
    user?: { full_name?: string };
  };
};

// The OTA report's row shape, confirmed against live data on 2026-07-12.
// employee/vehicle are marked nullable defensively — not observed null in
// practice, but nothing in the API guarantees every trip has both.
export type OtaTrip = {
  id: string;
  Date: string;
  trip_Distance: string;
  trip_tarif: string;
  trip_Service_Charge: string;
  Passengers: string;
  Level: string;
  company_id: string;
  company_name: string;
  departure_terminal_name: string;
  arrival_terminal_name: string;
  employee: { id: string; name: string; email: string } | null;
  vehicle: {
    id: string;
    plate_no: string;
    plate_code: string;
    fleet_category: string;
    association: string;
    level: string;
  } | null;
};

// Generic bag-of-fields view used by the CSV verification script — keeps
// that script decoupled from the exact typed shape above.
export type OtaTripRow = Record<string, unknown>;

type OtaTripsResponse = {
  data?: OtaTrip[];
  pagination?: { total?: number; pages?: number };
};

export async function otaLogin(config: OtaConfig): Promise<{ token: string; fullName: string }> {
  const res = await fetch(`${config.baseUrl}/api/auth/company-user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  const body = (await res.json().catch(() => ({}))) as OtaLoginResponse;
  const token = body.data?.token;
  if (!res.ok || !token) {
    throw new Error(`OTA login failed (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { token, fullName: body.data?.user?.full_name ?? "" };
}

export type DateWindow = { from?: Date; to?: Date };

export async function fetchOtaTripsPage(
  config: OtaConfig,
  token: string,
  page: number,
  limit: number,
  window: DateWindow = {}
): Promise<{ rows: OtaTrip[]; total: number; pages: number }> {
  const url = new URL(`${config.baseUrl}/api/reports/trips`);
  url.searchParams.set("company_id", config.companyId);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  // Confirmed against the live API on 2026-07-12: from/to narrow the result
  // set correctly when given full ISO timestamps (bare dates return zero
  // rows, so always pass a full Date -> toISOString()).
  if (window.from) url.searchParams.set("from", window.from.toISOString());
  if (window.to) url.searchParams.set("to", window.to.toISOString());

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OTA trips page ${page} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as OtaTripsResponse;
  const rows = body.data ?? [];
  const total = body.pagination?.total ?? rows.length;
  const pages = body.pagination?.pages ?? 1;
  return { rows, total, pages };
}

export type FetchAllOptions = DateWindow & {
  limit?: number;
  delayMs?: number;
  onPage?: (page: number, pages: number, rowsSoFar: number) => void;
};

export async function fetchAllOtaTrips(
  config: OtaConfig,
  options: FetchAllOptions = {}
): Promise<{ rows: OtaTrip[]; pagesFetched: number }> {
  const limit = options.limit ?? 100;
  const delayMs = options.delayMs ?? 300;
  const window: DateWindow = { from: options.from, to: options.to };

  const { token } = await otaLogin(config);

  const first = await fetchOtaTripsPage(config, token, 1, limit, window);
  const allRows = [...first.rows];
  options.onPage?.(1, first.pages, allRows.length);

  for (let page = 2; page <= first.pages; page++) {
    const { rows } = await fetchOtaTripsPage(config, token, page, limit, window);
    allRows.push(...rows);
    options.onPage?.(page, first.pages, allRows.length);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return { rows: allRows, pagesFetched: first.pages };
}

// Flattens nested objects/arrays into dot-notation string values, mirroring
// the Python script's CSV flattening so column names line up the same way.
export function flattenTripRow(obj: OtaTripRow, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenTripRow(v as OtaTripRow, key));
    } else if (Array.isArray(v)) {
      out[key] = v.length ? v.map(String).join(", ") : "";
    } else {
      out[key] = v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}
