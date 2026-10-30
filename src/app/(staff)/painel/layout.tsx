import type { Metadata, Viewport } from "next";
import { Globe, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AlertaPedidos } from "@/components/staff/alerta-pedidos";
import { FaixaConexao } from "@/components/staff/faixa-conexao";
import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { carregarAssinatura } from "@/lib/assinatura";
import { ehAdminPlataforma, exigirAcesso, temPermissao } from "@/lib/auth/dal";
import { lerModoSuporte } from "@/lib/auth/suporte";
import { estiloMarca } from "@/lib/cores";
import { urlIcone } from "@/lib/icone";
import { createClient } from "@/lib/supabase/server";
import { linkAjuda } from "@/lib/contato";

import { sairDoSuporte } from "../../(site)/admin/gestao-actions";
import { AvisoChamado } from "../garcom/aviso-chamado";
import { AvisoPedidoCliente } from "../garcom/aviso-pedido-cliente";
import { AvisoPronto } from "../garcom/aviso-pronto";
import { AvisoAssinatura } from "./aviso-assinatura";
import { ChamarGarcom } from "./chamar-garcom";
import { AbasSecao, BarraApp, MenuLateral } from "./menu-painel";
import { itensBloqueadosPeloPlano, itensDoMenu } from "./navegacao";

// App da equipe com a marca do restaurante: manifest e ícones em rotas públicas por restaurante
// (instala pelo navegador: "Adicionar à tela de início").
export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("painel");
  return {
    title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome },
    applicationName: restaurante.nome,
    manifest: `/pwa/${restaurante.id}/manifest?v=${urlIcone(restaurante, 192).split("v=")[1]}`,
    icons: {
      icon: [{ url: urlIcone(restaurante, 192), sizes: "192x192", type: "image/png" }],
      apple: [{ url: urlIcone(restaurante, 180), sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: restaurante.nome, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { restaurante } = await exigirAcesso("painel");
  return { themeColor: restaurante.corPrimaria, width: "device-width", initialScale: 1, viewportFit: "cover" };
}

// Pedidos de delivery aguardando aceite (contador no menu).
async function contarPedidosNovos(restauranteId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .eq("origem", "delivery")
    .eq("status", "recebido");
  return count ?? 0;
}

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const acesso = await exigirAcesso("painel");
  const itens = itensDoMenu(acesso.papel, acesso.permissoes);
  const bloqueados = itensBloqueadosPeloPlano(acesso.papel, itens);
  const [novos, assinatura, adminPlataforma, suporte] = await Promise.all([
    acesso.permissoes.includes("delivery") ? contarPedidosNovos(acesso.restaurante.id) : 0,
    acesso.papel === "dono" ? carregarAssinatura(acesso.restaurante.id) : null,
    ehAdminPlataforma(),
    lerModoSuporte(),
  ]);
  return (
    <div className="flex min-h-full flex-1 flex-col" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm print:hidden">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4">
          <Link href="/painel" className="min-w-0 flex-1">
            <MarcaRestaurante restaurante={acesso.restaurante} />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {adminPlataforma ? (
              <Link
                href="/admin"
                aria-label="Painel da plataforma"
                className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--cor-primaria-contraste)]/30 px-3 text-sm font-semibold hover:bg-black/10"
              >
                <ShieldCheck className="size-4" aria-hidden />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            ) : null}
            <a
              href={`/${acesso.restaurante.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver meu site"
              className="flex h-11 items-center gap-1.5 rounded-full border border-[var(--cor-primaria-contraste)]/30 px-3 text-sm font-semibold hover:bg-black/10"
            >
              <Globe className="size-4" aria-hidden />
              <span className="hidden sm:inline">Meu site</span>
            </a>
            {temPermissao(acesso, "caixa_operar", "delivery", "comandas_painel") ? (
              <ChamarGarcom restauranteId={acesso.restaurante.id} membroId={acesso.membroId} />
            ) : null}
            {acesso.permissoes.includes("delivery") ? <AlertaPedidos restauranteId={acesso.restaurante.id} /> : null}
            <MenuUsuario
              nome={acesso.nome}
              papel={acesso.funcao}
              podeTrocarRestaurante={acesso.vinculos.length > 1}
              adminPlataforma={adminPlataforma}
              assinatura={acesso.papel === "dono"}
              ajuda={linkAjuda(acesso.restaurante)}
            />
          </div>
        </div>
        <FaixaConexao />
      </header>
      {/* "Entrar como" do admin da plataforma: deixa claro que é suporte e como voltar. */}
      {suporte ? (
        <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-zinc-900 px-4 py-2 text-center text-sm text-white print:hidden">
          <span>
            Modo suporte: você está como <strong>{suporte.dono}</strong> em <strong>{suporte.restaurante}</strong> ({suporte.admin})
          </span>
          <form action={sairDoSuporte}>
            <button type="submit" className="rounded-md bg-white/15 px-3 py-1 font-semibold hover:bg-white/25">
              Sair do modo suporte
            </button>
          </form>
        </div>
      ) : null}
      {/* Quem atende mesas recebe os avisos em qualquer tela: prato pronto e chamado do caixa. */}
      {acesso.permissoes.includes("garcom_app") ? (
        <>
          <AvisoPronto restauranteId={acesso.restaurante.id} membroId={acesso.membroId} />
          <AvisoChamado restauranteId={acesso.restaurante.id} membroId={acesso.membroId} />
          <AvisoPedidoCliente restauranteId={acesso.restaurante.id} membroId={acesso.membroId} />
        </>
      ) : null}
      <div className="flex flex-1">
        <MenuLateral itens={itens} novos={novos} bloqueados={bloqueados} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AvisoAssinatura assinatura={assinatura} />
          {/* No celular, espaço para a barra de abas do rodapé. */}
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col pb-20 lg:pb-0">
            <AbasSecao itens={itens} />
            {children}
          </div>
        </div>
      </div>
      <BarraApp itens={itens} novos={novos} bloqueados={bloqueados} />
    </div>
  );
}
