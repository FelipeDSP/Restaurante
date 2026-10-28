import type { Metadata } from "next";
import QRCode from "qrcode";

import { exigirPermissao, temPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

import { BotaoImprimir } from "../../caixa/formularios";
import { ChavePedidoMesa, TrocarQr } from "./controles";

export const metadata: Metadata = { title: "QR code das mesas" };

// Um QR por mesa: o cliente abre o cardápio daquela mesa (e pede, se o dono ligou).
// "Imprimir" sai uma folha com os cartões para recortar e colar nas mesas.
export default async function QrCodeMesasPage() {
  const acesso = await exigirPermissao("painel", "mesas");
  const supabase = await createClient();
  const [{ data: mesas, error }, { data: restaurante }] = await Promise.all([
    supabase
      .from("mesas")
      .select("id, numero, qr_token")
      .eq("restaurante_id", acesso.restaurante.id)
      .eq("ativa", true)
      .order("ordem")
      .order("numero"),
    supabase.from("restaurantes").select("pedido_mesa_qr").eq("id", acesso.restaurante.id).single(),
  ]);
  if (error) throw new Error(error.message);

  const origem = await origemDoSite();
  // Preto no branco e margem própria: lê melhor com qualquer câmera, impresso em qualquer papel.
  const cartoes = await Promise.all(
    mesas.map(async (m) => ({
      ...m,
      svg: await QRCode.toString(`${origem}/${acesso.restaurante.slug}/mesa/${m.qr_token}`, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }),
    })),
  );

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold">QR code das mesas</h1>
        <div className="flex flex-wrap items-center gap-2">
          {temPermissao(acesso, "restaurante") ? <ChavePedidoMesa ligado={restaurante?.pedido_mesa_qr ?? false} /> : null}
          {cartoes.length > 0 ? <BotaoImprimir /> : null}
        </div>
      </div>

      {cartoes.length === 0 ? (
        <p className="text-muted-foreground">Cadastre as mesas primeiro.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-4 print:grid-cols-2 print:gap-6">
          {cartoes.map((m) => (
            <div
              key={m.id}
              className="flex break-inside-avoid flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-black/30 bg-white p-5 text-center text-black"
            >
              <p className="text-sm font-semibold">{acesso.restaurante.nome}</p>
              <p className="text-2xl font-bold">Mesa {m.numero}</p>
              <div className="w-full max-w-48 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: m.svg }} />
              <p className="text-sm">Aponte a câmera do celular para ver o cardápio</p>
              <TrocarQr mesaId={m.id} mesa={m.numero} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
