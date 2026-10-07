import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { lerAdicionais } from "@/lib/adicionais";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { horaLocal, tempoDesde } from "@/lib/tempo";

import { carregarSessaoAberta } from "../caixa/dados";
import { CartaoPedido, type PedidoDelivery } from "./cartao-pedido";

export const metadata: Metadata = { title: "Delivery" };

const COLUNAS: { titulo: string; status: PedidoDelivery["status"][]; vazio: string }[] = [
  { titulo: "Novos", status: ["recebido"], vazio: "Nenhum pedido novo." },
  { titulo: "Em preparo", status: ["em_preparo", "pronto"], vazio: "Nada em preparo." },
  { titulo: "Em entrega", status: ["saiu_entrega"], vazio: "Nada em entrega." },
  { titulo: "Finalizados", status: ["entregue", "cancelado"], vazio: "Nenhum pedido finalizado nesta sessão." },
];

export default async function DeliveryPage() {
  const acesso = await exigirAcesso("painel");
  const supabase = await createClient();
  const sessao = await carregarSessaoAberta(acesso.restaurante.id);
  const fuso = acesso.restaurante.fusoHorario;

  // Em andamento (de qualquer sessão) + finalizados da sessão atual.
  const filtro = sessao
    ? `status.not.in.(entregue,cancelado),caixa_sessao_id.eq.${sessao.id}`
    : "status.not.in.(entregue,cancelado)";
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      `id, numero, status, criado_em, cliente_nome, cliente_telefone, endereco, forma_pagamento_prevista, troco_para,
       observacao, subtotal, taxa_entrega, total, motivo_cancelamento,
       bairro:bairros_entrega!pedidos_restaurante_id_bairro_id_fkey(nome),
       itens_pedido(id, nome_produto, quantidade, observacao, adicionais, total, cancelado_em),
       pagamentos(valor, estornado_em),
       tarefas_producao(status)`,
    )
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .or(filtro)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const pedidos: PedidoDelivery[] = data.map((p) => ({
    id: p.id,
    numero: p.numero,
    status: p.status as PedidoDelivery["status"],
    hora: horaLocal(p.criado_em, fuso),
    tempo: tempoDesde(p.criado_em),
    clienteNome: p.cliente_nome ?? "",
    clienteTelefone: p.cliente_telefone ?? "",
    endereco:
      p.endereco && typeof p.endereco === "object" && !Array.isArray(p.endereco)
        ? (p.endereco as Record<string, string | null>)
        : {},
    bairro: p.bairro?.nome ?? null,
    formaPrevista: p.forma_pagamento_prevista,
    trocoPara: p.troco_para,
    observacao: p.observacao,
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    total: p.total,
    pago: p.pagamentos.filter((pg) => !pg.estornado_em).reduce((soma, pg) => soma + pg.valor, 0),
    pracasPendentes: p.tarefas_producao.filter((t) => t.status === "pendente").length,
    motivoCancelamento: p.motivo_cancelamento,
    itens: p.itens_pedido
      .filter((i) => !i.cancelado_em)
      .map((i) => ({
        id: i.id,
        nome: i.nome_produto,
        quantidade: i.quantidade,
        observacao: i.observacao,
        adicionais: lerAdicionais(i.adicionais),
        total: i.total,
      })),
  }));

  return (
    <main className="flex flex-col gap-4 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["pedidos", "pagamentos", "tarefas_producao"]} />
      <div>
        <h1 className="text-2xl font-semibold">Delivery</h1>
        <p className="text-muted-foreground">
          {sessao
            ? "Novos pedidos chegam aqui sozinhos, com aviso sonoro (toque no sino no topo para ativar o som)."
            : "Caixa fechado: o site não recebe pedidos até o caixa ser aberto."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {COLUNAS.map((coluna) => {
          const lista = pedidos.filter((p) => coluna.status.includes(p.status));
          // Finalizados: mais recentes primeiro.
          if (coluna.titulo === "Finalizados") lista.reverse();
          return (
            <section key={coluna.titulo} aria-labelledby={`coluna-${coluna.titulo}`} className="flex flex-col gap-3">
              <h2 id={`coluna-${coluna.titulo}`} className="flex items-center justify-between font-semibold">
                {coluna.titulo}
                <span className="rounded-full bg-muted px-2 text-sm">{lista.length}</span>
              </h2>
              {lista.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{coluna.vazio}</p>
              ) : (
                lista.map((pedido) => <CartaoPedido key={pedido.id} pedido={pedido} />)
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
