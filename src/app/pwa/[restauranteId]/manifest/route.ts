import { urlIcone } from "@/lib/icone";
import { buscarRestaurantePublico } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

// Manifest do app do garçom com a marca do restaurante (white label).
// Rota pública: o navegador baixa o manifest sem cookies.
// Nome embaixo do ícone (cabe ~12 letras): palavras inteiras, sem cortar no meio ("Brasa Espeti").
function nomeCurto(nome: string): string {
  if (nome.length <= 12) return nome;
  let curto = "";
  for (const palavra of nome.split(/\s+/)) {
    const proximo = curto ? `${curto} ${palavra}` : palavra;
    if (proximo.length > 12) break;
    curto = proximo;
  }
  return curto || nome.slice(0, 12);
}

export async function GET(_request: Request, ctx: RouteContext<"/pwa/[restauranteId]/manifest">) {
  const { restauranteId } = await ctx.params;
  if (!id.safeParse(restauranteId).success) return new Response("Não encontrado", { status: 404 });

  const restaurante = await buscarRestaurantePublico(restauranteId);
  if (!restaurante?.id || !restaurante.nome || !restaurante.cor_primaria) {
    return new Response("Não encontrado", { status: 404 });
  }

  const marca = { id: restaurante.id, nome: restaurante.nome, corPrimaria: restaurante.cor_primaria, logoUrl: restaurante.logo_url };
  const icone = (tamanho: 192 | 512) => urlIcone(marca, tamanho);
  const manifest = {
    id: `/garcom?r=${restauranteId}`,
    name: restaurante.nome,
    short_name: nomeCurto(restaurante.nome),
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
