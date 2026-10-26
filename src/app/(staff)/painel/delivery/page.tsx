import type { Metadata } from "next";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { lerAdicionais } from "@/lib/adicionais";
import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { horaLocal, tempoDesde } from "@/lib/tempo";

import { carregarSessaoAberta } from "../caixa/dados";
import type { PedidoDelivery } from "./cartao-pedido";
import { QuadroDelivery } from "./quadro-delivery";

export const metadata: Metadata = { title: "Delivery" };

export default async function DeliveryPage() {
  const acesso = await exigirPermissao("painel", "delivery");
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
      `id, numero, status, criado_em, cliente_nome, cliente_telefone, endereco, bairro_id, forma_pagamento_prevista, troco_para,
       observacao, subtotal, taxa_entrega, total, motivo_cancelamento, desconto, cupom_codigo, cupom_tipo, cupom_valor,
       bairro:bairros_entrega!pedidos_restaurante_id_bairro_id_fkey(nome),
       itens_pedido(id, nome_produto, quantidade, observacao, adicionais, total, cancelado_em),
       pagamentos(valor, estornado_em),
       tarefas_producao(status),
       pedidos_alteracoes(descricao, criado_em),
       entregador_id, valor_entregador`,
    )
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("origem", "delivery")
    .or(filtro)
    .order("criado_em", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const { data: entregadores } = await supabase
    .from("entregadores")
    .select("id, nome")
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("ativo", true)
    .order("nome");

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
    bairro:
      p.bairro?.nome ??
      (p.endereco && typeof p.endereco === "object" && !Array.isArray(p.endereco)
        ? ((p.endereco as Record<string, string | null>).bairro ?? null)
        : null),
    formaPrevista: p.forma_pagamento_prevista,
    trocoPara: p.troco_para,
    observacao: p.observacao,
    subtotal: p.subtotal,
    taxaEntrega: p.taxa_entrega,
    desconto: p.desconto,
    cupom: p.cupom_codigo ? { codigo: p.cupom_codigo, tipo: p.cupom_tipo ?? "", valor: p.cupom_valor ?? 0 } : null,
    total: p.total,
    pago: p.pagamentos.filter((pg) => !pg.estornado_em).reduce((soma, pg) => soma + pg.valor, 0),
    pracasPendentes: p.tarefas_producao.filter((t) => t.status === "pendente").length,
    motivoCancelamento: p.motivo_cancelamento,
    bairroId: p.bairro_id,
    entregadorId: p.entregador_id,
    valorEntregador: p.valor_entregador,
    alteracoes: p.pedidos_alteracoes
      .toSorted((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((a) => ({ descricao: a.descricao, hora: horaLocal(a.criado_em, fuso) })),
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
        {/* Só o que importa agora: com o caixa fechado, o site não recebe pedidos. */}
        {!sessao ? (
          <p className="text-sm font-medium text-destructive">Caixa fechado: o site não recebe pedidos até o caixa ser aberto.</p>
        ) : null}
      </div>
      <QuadroDelivery pedidos={pedidos} entregadores={entregadores} />
    </main>
  );
}
