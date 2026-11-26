import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

// Cartão que aparece quando alguém manda o link da uau foods no WhatsApp, no Instagram ou no
// Facebook. Antes o cartão apontava para o arquivo da marca (2717x932, fundo transparente): fora
// da proporção que as redes esperam, e sobre fundo escuro a marca marrom sumia. Aqui o cartão é
// desenhado no tamanho certo, com o fundo creme da marca.
export const alt = "uau foods · sistema para espetinhos, hamburguerias e lanchonetes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function CartaoDeCompartilhamento() {
  // Lido do disco no build: o cartão é gerado uma vez, junto com a página.
  const marca = await readFile(join(process.cwd(), "public/marca/uau-foods.png"));
  const marcaEmBase64 = `data:image/png;base64,${marca.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          backgroundColor: "#fff8ef",
          // Faixa laranja embaixo, o mesmo detalhe do traço da marca.
          borderBottom: "24px solid #f59600",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse não usa next/image */}
        <img src={marcaEmBase64} alt="" width={760} height={261} />
        <div style={{ display: "flex", fontSize: 40, color: "#2b1a12", textAlign: "center" }}>
          Do pedido à brasa, sem papel e sem comissão.
        </div>
      </div>
    ),
    size,
  );
}
