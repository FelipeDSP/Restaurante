import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import QRCode from "qrcode";

import { buttonVariants } from "@/components/ui/button";
import { exigirPermissao } from "@/lib/auth/dal";
import { origemDoSite } from "@/lib/url";
import { cn } from "@/lib/utils";

import { BotaoImprimir } from "../../caixa/formularios";

export const metadata: Metadata = { title: "QR code do cardápio" };

// Folha para imprimir: 4 cartões com o QR code do cardápio do salão (recortar e pôr nas mesas).
export default async function QrCodeCardapioPage() {
  const acesso = await exigirPermissao("painel", "mesas");
  const url = `${await origemDoSite()}/${acesso.restaurante.slug}/cardapio`;
  // Preto no branco e margem própria: lê melhor com qualquer câmera, impresso em qualquer papel.
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });

  const cartao = (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-black/30 bg-white p-6 text-center text-black">
      <p className="text-xl font-bold">{acesso.restaurante.nome}</p>
      <div className="w-full max-w-56 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-lg font-semibold">Cardápio</p>
      <p className="text-sm">Aponte a câmera do celular</p>
    </div>
  );

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold">QR code do cardápio</h1>
        <div className="flex gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }))}>
            <ExternalLink aria-hidden />
            Ver cardápio
          </a>
          <BotaoImprimir />
        </div>
      </div>

      {/* Na tela, um cartão; na impressão, a folha com quatro. */}
      <div className="mx-auto w-full max-w-xs print:hidden">{cartao}</div>
      <div className="hidden print:grid print:grid-cols-2 print:gap-6">
        {cartao}
        {cartao}
        {cartao}
        {cartao}
      </div>
    </main>
  );
}
