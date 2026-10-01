import { buscarRestaurantePublico } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

// Manifest do app do garçom com a marca do restaurante (white label).
// Rota pública: o navegador baixa o manifest sem cookies.
export async function GET(_request: Request, ctx: RouteContext<"/pwa/[restauranteId]/manifest">) {
  const { restauranteId } = await ctx.params;
  if (!id.safeParse(restauranteId).success) return new Response("Não encontrado", { status: 404 });

  const restaurante = await buscarRestaurantePublico(restauranteId);
  if (!restaurante?.id || !restaurante.nome || !restaurante.cor_primaria) {
    return new Response("Não encontrado", { status: 404 });
  }

  const icone = (tamanho: number) => `/pwa/${restauranteId}/icone/${tamanho}`;
  const manifest = {
    id: `/garcom?r=${restauranteId}`,
    name: restaurante.nome,
    short_name: restaurante.nome.slice(0, 12),
    description: `Atendimento de mesas · ${restaurante.nome}`,
    start_url: "/garcom",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "pt-BR",
    background_color: "#ffffff",
    theme_color: restaurante.cor_primaria,
    icons: [
      { src: icone(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icone(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: icone(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
