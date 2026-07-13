// src/app/api/health/route.ts
// Deliberately does nothing but respond — no DB query, no auth. This is the
// keep-alive workflow's ping target: it exists purely to keep Render's free
// web service from spinning down on idle, so it needs to be as cheap and
// fast as possible on every hit.
export async function GET() {
  return new Response("ok", { status: 200 });
}
