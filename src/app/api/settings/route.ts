// src/app/api/settings/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { badRequest, ok, serverError } from "@/lib/api-utils";
import { bulkUpsertSystemConfigSchema } from "@/lib/schemas/settings";

/**
 * GET /api/settings
 * Returns all system config entries as a flat array and a key-value map.
 *
 * Query params:
 *   key — filter to a single key (optional)
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    const configs = await prisma.systemConfig.findMany({
      where: key ? { key } : undefined,
      orderBy: { key: "asc" },
    });

    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;

    return ok({ data: configs, map });
  } catch (error) {
    return serverError(error);
  }
}

/**
 * PUT /api/settings
 * Bulk upsert system config entries.
 * Body: { configs: [{ key, value, description? }] }
 *
 * Known keys used by the system:
 *   pos_latest_app_version  — e.g. "ORO Ticket v2.4.1"
 *   company_name            — e.g. "Adrash Intercity Transport"
 *   support_phone           — e.g. "+251911000000"
 *   ticket_receipt_footer   — footer text on printed tickets
 */
export async function PUT(request: NextRequest) {
  const auth = requireAuth(request);
  if (auth) return auth;

  try {
    const body = await request.json();
    const parsed = bulkUpsertSystemConfigSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid request body.", parsed.error.flatten());

    const updatedBy = request.headers.get("x-admin-id") ?? null;

    const results = await prisma.$transaction(
      parsed.data.configs.map((c) =>
        prisma.systemConfig.upsert({
          where: { key: c.key },
          create: { key: c.key, value: c.value, description: c.description ?? null, updatedBy },
          update: { value: c.value, description: c.description ?? null, updatedBy },
        })
      )
    );

    return ok({ data: results });
  } catch (error) {
    return serverError(error);
  }
}