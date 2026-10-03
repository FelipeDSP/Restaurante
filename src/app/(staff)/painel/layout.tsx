import type { Metadata } from "next";
import Link from "next/link";

import { AlertaPedidos } from "@/components/staff/alerta-pedidos";
import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { MenuUsuario } from "@/components/staff/menu-usuario";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";
import { estiloMarca } from "@/lib/cores";
import { createClient } from "@/lib/supabase/server";

import { NAVEGACAO } from "./navegacao";

export async function generateMetadata(): Promise<Metadata> {
  const { restaurante } = await exigirAcesso("painel");
  return { title: { template: `%s · ${restaurante.nome}`, default: restaurante.nome } };
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

function ItemMenu({ href, rotulo, contador }: { href: string; rotulo: string; contador?: number }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:bg-black/10"
    >
      {rotulo}
      {contador ? (
        <span
          className="flex min-w-5 items-center justify-center rounded-full bg-[var(--cor-secundaria)] px-1.5 text-xs font-bold text-[var(--cor-secundaria-contraste)]"
          aria-label={`${contador} novos`}
        >
          {contador}
        </span>
      ) : null}
    </Link>
  );
}

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const acesso = await exigirAcesso("painel");
  const itens = NAVEGACAO.filter((item) => item.papeis.includes(acesso.papel));
  const novos = await contarPedidosNovos(acesso.restaurante.id);
  const contador = (href: string) => (href === "/painel/delivery" ? novos : undefined);

  return (
    <div className="flex min-h-full flex-1 flex-col" style={estiloMarca(acesso.restaurante)}>
      <header className="sticky top-0 z-10 bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/painel" className="min-w-0 shrink-0">
            <MarcaRestaurante restaurante={acesso.restaurante} />
          </Link>
          <nav aria-label="Painel" className="hidden min-w-0 flex-1 gap-1 overflow-x-auto lg:flex">
            {itens.map((item) => (
              <ItemMenu key={item.href} href={item.href} rotulo={item.rotulo} contador={contador(item.href)} />
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <AlertaPedidos restauranteId={acesso.restaurante.id} />
            <MenuUsuario
              nome={acesso.nome}
              papel={NOME_PAPEL[acesso.papel]}
              podeTrocarRestaurante={acesso.vinculos.length > 1}
              outraArea={{ href: "/garcom", rotulo: "Abrir área do garçom" }}
            />
          </div>
        </div>
        <nav aria-label="Painel" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:hidden">
          {itens.map((item) => (
            <ItemMenu key={item.href} href={item.href} rotulo={item.rotulo} contador={contador(item.href)} />
          ))}
        </nav>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">{children}</div>
    </div>
  );
}
