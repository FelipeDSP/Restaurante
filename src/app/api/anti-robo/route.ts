// Chave pública do Cloudflare Turnstile, lida em tempo de execução (variável TURNSTILE_SITE_KEY no
// Coolify): ligar ou desligar o anti-robô não exige novo build. Sem a variável, os formulários
// funcionam sem a verificação.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ chave: process.env.TURNSTILE_SITE_KEY || null }, { headers: { "Cache-Control": "no-store" } });
}
