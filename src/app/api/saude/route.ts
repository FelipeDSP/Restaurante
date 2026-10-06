// Healthcheck do container (Coolify/Docker). Não toca no banco: só indica que o servidor responde.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
