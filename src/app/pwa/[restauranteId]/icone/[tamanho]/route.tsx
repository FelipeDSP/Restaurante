import { ImageResponse } from "next/og";

import { corDeContraste } from "@/lib/cores";
import { buscarRestaurantePublico } from "@/lib/supabase/publico";
import { id } from "@/lib/validacao";

const TAMANHOS = new Set([180, 192, 512]);

// Ícone do PWA: logo do restaurante (se houver) ou a inicial sobre a cor da marca.
// Margem de ~20% para servir também como ícone "maskable" (Android recorta em círculo).
export async function GET(_request: Request, ctx: RouteContext<"/pwa/[restauranteId]/icone/[tamanho]">) {
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
        {restaurante.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- renderizado pelo ImageResponse
          <img
            src={restaurante.logo_url}
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
      headers: { "Cache-Control": "public, max-age=3600" },
    },
  );
}
