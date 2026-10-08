import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AlertaPedidos } from "@/components/staff/alerta-pedidos";
import { FaixaConexao } from "@/components/staff/faixa-conexao";
import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { carregarAssinatura } from "@/lib/assinatura";
import { ehAdminPlataforma, exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";
import { urlIcone } from "@/lib/icone";
import { createClient } from "@/lib/supabase/server";

import { AvisoAssinatura } from "./aviso-assinatura";
import { MenuCelular, MenuLateral } from "./menu-painel";
import { NAVEGACAO } from "./navegacao";

export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("painel");
  return {
    title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome },
    icons: { icon: urlIcone(restaurante, 192), apple: urlIcone(restaurante, 180) },
  };
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
  const itens = NAVEGACAO.filter((item) => item.papeis.includes(acesso.papel));
  const [novos, assinatura, adminPlataforma] = await Promise.all([
    contarPedidosNovos(acesso.restaurante.id),
    acesso.papel === "dono" ? carregarAssinatura(acesso.restaurante.id) : null,
    ehAdminPlataforma(),
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
            <AlertaPedidos restauranteId={acesso.restaurante.id} />
            <MenuUsuario
              nome={acesso.nome}
              papel={NOME_PAPEL[acesso.papel]}
              podeTrocarRestaurante={acesso.vinculos.length > 1}
              outraArea={{ href: "/garcom", rotulo: "Abrir área do garçom" }}
              adminPlataforma={adminPlataforma}
            />
          </div>
        </div>
        <MenuCelular itens={itens} novos={novos} />
        <FaixaConexao />
      </header>
      <div className="flex flex-1">
        <MenuLateral itens={itens} novos={novos} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AvisoAssinatura assinatura={assinatura} />
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
}
