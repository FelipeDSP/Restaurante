import { ImageResponse } from "next/og";
import sharp from "sharp";

import { corDeContraste } from "@/lib/cores";
import { buscarRestaurantePublico } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

const TAMANHOS = new Set([180, 192, 512]);

// O desenho do ImageResponse não lê WebP (formato dos uploads): converte o logo para PNG.
async function logoEmPng(url: string, lado: number): Promise<string | null> {
  try {
    const resposta = await fetch(url);
    if (!resposta.ok) return null;
    const png = await sharp(Buffer.from(await resposta.arrayBuffer()))
      .resize(lado, lado, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

// Ícone do PWA: logo do restaurante (se houver) ou a inicial sobre a cor da marca.
// Margem de ~20% para servir também como ícone "maskable" (Android recorta em círculo).
export async function GET(request: Request, ctx: RouteContext<"/pwa/[restauranteId]/icone/[tamanho]">) {
  const { restauranteId, tamanho: tamanhoTexto } = await ctx.params;
  const tamanho = Number(tamanhoTexto);
  if (!id.safeParse(restauranteId).success || !TAMANHOS.has(tamanho)) {
    return new Response("Não encontrado", { status: 404 });
  }

  const restaurante = await buscarRestaurantePublico(restauranteId);
  if (!restaurante?.id || !restaurante.cor_primaria || !restaurante.nome) {
    return new Response("Não encontrado", { status: 404 });
  }

  const conteudo = Math.round(tamanho * 0.6);
  // Logo que não abre: cai na inicial em vez de um quadrado vazio.
  const logo = restaurante.logo_url ? await logoEmPng(restaurante.logo_url, conteudo * 2) : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: restaurante.cor_primaria,
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- renderizado pelo ImageResponse
          <img
            src={logo}
            alt=""
            width={conteudo}
            height={conteudo}
            style={{ objectFit: "contain", borderRadius: tamanho * 0.08, background: "#ffffff" }}
          />
        ) : (
          <span
            style={{
              fontSize: conteudo,
              fontWeight: 700,
              color: corDeContraste(restaurante.cor_primaria),
              lineHeight: 1,
            }}
          >
            {restaurante.nome.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    ),
    {
      width: tamanho,
      height: tamanho,
      // Com a versão da marca no endereço (?v=), o ícone pode ficar em cache por muito tempo.
      headers: {
        "Cache-Control": new URL(request.url).searchParams.has("v") ? "public, max-age=604800, immutable" : "public, max-age=3600",
      },
    },
  );
}
