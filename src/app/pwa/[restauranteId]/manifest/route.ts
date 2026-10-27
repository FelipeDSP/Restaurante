import { urlIcone } from "@/lib/icone";
import { buscarRestaurantePublico } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

// Manifest do app da equipe com a marca do restaurante (white label).
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

export async function GET(request: Request, ctx: RouteContext<"/pwa/[restauranteId]/manifest">) {
  const { restauranteId } = await ctx.params;
  if (!id.safeParse(restauranteId).success) return new Response("Não encontrado", { status: 404 });

  const restaurante = await buscarRestaurantePublico(restauranteId);
  if (!restaurante?.id || !restaurante.nome || !restaurante.cor_primaria) {
    return new Response("Não encontrado", { status: 404 });
  }

  const marca = { id: restaurante.id, nome: restaurante.nome, corPrimaria: restaurante.cor_primaria, logoUrl: restaurante.logo_url };
  const icone = (tamanho: 192 | 512) => urlIcone(marca, tamanho);
  // Site do cliente: sem start_url, o app instalado abre a página de onde foi instalado (o
  // acompanhamento do pedido, no caso dos avisos no iPhone).
  if (new URL(request.url).searchParams.get("app") === "site") {
    return Response.json(
      {
        name: restaurante.nome,
        short_name: nomeCurto(restaurante.nome),
        scope: "/",
        display: "standalone",
        lang: "pt-BR",
        background_color: "#ffffff",
        theme_color: restaurante.cor_primaria,
        icons: [
          { src: icone(192), sizes: "192x192", type: "image/png", purpose: "any" },
          { src: icone(512), sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
      { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } },
    );
  }

  const manifest = {
    // Mesmo id de quando o app era só do garçom: quem já instalou recebe a atualização (sem ícone duplicado).
    id: `/garcom?r=${restauranteId}`,
    name: restaurante.nome,
    short_name: nomeCurto(restaurante.nome),
    description: `Equipe · ${restaurante.nome}`,
    // Abre na área da pessoa (o painel manda quem só atende mesas para as Mesas).
    start_url: "/painel",
    // Só o painel: com "/" o app da equipe cobria o site do cliente e, no Android, os avisos do
    // pedido (Web Push) iam para ele e abriam o painel em vez do acompanhamento.
    scope: "/painel",
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
