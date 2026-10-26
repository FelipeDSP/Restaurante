import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirPermissao } from "@/lib/auth/dal";
import { id as idSchema } from "@/lib/validacao";

import { AvisoCaixaFechado } from "../../../garcom/aviso-caixa";
import { caixaEstaAberto, carregarComandaDaMesa, carregarMesa } from "../../../garcom/dados";
import { AbrirComanda } from "../../../garcom/mesas/[mesaId]/abrir-comanda";
import { TelaComanda } from "../../../garcom/mesas/[mesaId]/tela-comanda";

export async function generateMetadata(props: PageProps<"/painel/comandas/[mesaId]">): Promise<Metadata> {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  const { mesaId } = await props.params;
  const mesa = idSchema.safeParse(mesaId).success ? await carregarMesa(acesso.restaurante.id, mesaId) : null;
  return { title: mesa ? `Mesa ${mesa.numero}` : "Mesa" };
}

// A mesa no painel: a mesma tela do app do garçom, em duas colunas no computador.
export default async function MesaPainelPage(props: PageProps<"/painel/comandas/[mesaId]">) {
  const acesso = await exigirPermissao("painel", "comandas_painel", "garcom_app");
  const { mesaId } = await props.params;
  if (!idSchema.safeParse(mesaId).success) notFound();

  const [mesa, comanda, caixaAberto] = await Promise.all([
    carregarMesa(acesso.restaurante.id, mesaId),
    carregarComandaDaMesa(acesso.restaurante.id, mesaId),
    caixaEstaAberto(acesso.restaurante.id),
  ]);
  if (!mesa) notFound();

  return (
    <main className="flex w-full flex-1 flex-col gap-4 p-4 md:p-6">
      <AtualizarEmTempoReal
        restauranteId={acesso.restaurante.id}
        tabelas={["comandas", "itens_pedido", "pagamentos", "tarefas_producao", "caixa_sessoes"]}
      />
      <Link
        href="/painel/comandas"
        className="-ml-2 flex h-10 w-fit items-center gap-1 rounded-md px-2 text-sm font-medium hover:bg-muted"
      >
        <ChevronLeft className="size-5" />
        Mesas
      </Link>
      <h1 className="text-3xl font-bold">Mesa {mesa.numero}</h1>
      {!caixaAberto ? <AvisoCaixaFechado /> : null}
      {comanda ? (
        <TelaComanda
          key={comanda.id}
          mesaId={mesa.id}
          comanda={comanda}
          podeGerenciar={acesso.permissoes.includes("comandas_gerenciar")}
          podeEstornar={acesso.permissoes.includes("caixa_estornar")}
          fusoHorario={acesso.restaurante.fusoHorario}
          origem="painel"
        />
      ) : mesa.ativa ? (
        <div className="w-full max-w-md">
          <AbrirComanda mesaId={mesa.id} desabilitado={!caixaAberto} />
        </div>
      ) : (
        <p className="text-muted-foreground">Mesa desativada.</p>
      )}
    </main>
  );
}
