import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { lerAdicionais } from "@/lib/adicionais";
import { exigirAcesso } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { horaLocal, tempoDesde } from "@/lib/tempo";

import { carregarSessaoAberta } from "../caixa/dados";
import type { PedidoDelivery } from "./cartao-pedido";
import { QuadroDelivery } from "./quadro-delivery";

export const metadata: Metadata = { title: "Delivery" };

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
    <main className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-6">
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["pedidos", "pagamentos", "tarefas_producao"]} />
      <div>
        <h1 className="text-2xl font-semibold">Delivery</h1>
        <p className="text-sm text-muted-foreground">
          {sessao
            ? "Novos pedidos chegam sozinhos, com aviso sonoro (toque no sino no topo para ativar o som). No computador, arraste o cartão para a próxima coluna."
            : "Caixa fechado: o site não recebe pedidos até o caixa ser aberto."}
        </p>
      </div>
      <QuadroDelivery pedidos={pedidos} />
    </main>
  );
}
