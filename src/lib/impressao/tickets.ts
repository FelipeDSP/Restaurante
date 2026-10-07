import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lerAdicionais, resumoAdicionais } from "@/lib/adicionais";
import { formatarBRL } from "@/lib/dinheiro";
import { nomeForma } from "@/lib/rotulos";
import { dataHoraLocal, horaLocal } from "@/lib/tempo";
import { consultarTarefas, montarTickets, type Ticket } from "@/lib/tickets-producao";
import type { Database, Tables } from "@/types/database";

import type { Documento, Linha } from "./escpos";

type Cliente = SupabaseClient<Database>;
type Trabalho = Tables<"fila_impressao">;
type Restaurante = { nome: string; fuso: string };

// null = nada a imprimir (ex.: pedido cancelado antes de sair).
export async function montarDocumento(supabase: Cliente, trabalho: Trabalho, restaurante: Restaurante): Promise<Documento | null> {
  switch (trabalho.tipo) {
    case "producao":
    case "cancelamento":
      return trabalho.tarefa_id ? documentoPraca(supabase, trabalho, restaurante) : null;
    case "conta":
      return trabalho.comanda_id ? documentoConta(supabase, trabalho.comanda_id, restaurante) : null;
    case "delivery":
      return trabalho.pedido_id ? documentoDelivery(supabase, trabalho.pedido_id, restaurante) : null;
    case "teste":
      return documentoTeste(supabase, trabalho, restaurante);
    default:
      return null;
  }
}

function tituloPedido(t: Ticket): string {
  if (t.pedido.origem === "mesa" && t.pedido.mesa) return `MESA ${t.pedido.mesa}`;
  if (t.pedido.origem === "delivery") return "DELIVERY";
  return "BALCAO";
}

async function documentoPraca(supabase: Cliente, trabalho: Trabalho, r: Restaurante): Promise<Documento | null> {
  const { data, error } = await consultarTarefas(supabase).eq("id", trabalho.tarefa_id!).maybeSingle();
  if (error) throw new Error(error.message);
  const ticket = data ? montarTickets([data])[0] : undefined;
  if (!ticket) return null;

  const linhas: Linha[] = [];
  if (trabalho.tipo === "cancelamento") {
    const item = ticket.itens.find((i) => i.id === trabalho.item_id);
    if (!item) return null;
    linhas.push(
      { tipo: "texto", texto: "*** CANCELADO ***", alinhar: "centro", negrito: true, grande: true },
      { tipo: "texto", texto: ticket.praca.nome.toUpperCase(), alinhar: "centro", negrito: true },
      { tipo: "texto", texto: tituloPedido(ticket), alinhar: "centro", negrito: true, grande: true },
      { tipo: "texto", texto: `Pedido nº ${ticket.pedido.numero} · ${horaLocal(new Date().toISOString(), r.fuso)}`, alinhar: "centro" },
      { tipo: "separador" },
      { tipo: "texto", texto: `${item.quantidade}x ${item.nome}`, negrito: true, grande: true },
    );
    if (item.adicionais.length > 0) linhas.push({ tipo: "texto", texto: `  ${resumoAdicionais(item.adicionais)}` });
    linhas.push({ tipo: "separador" }, { tipo: "texto", texto: "Não preparar este item.", alinhar: "centro", negrito: true });
    return { linhas };
  }

  const ativos = ticket.itens.filter((i) => !i.cancelado);
  if (ativos.length === 0) return null;
  const tudoViagem = ativos.every((i) => i.paraViagem);

  linhas.push(
    { tipo: "texto", texto: r.nome, alinhar: "centro" },
    { tipo: "texto", texto: ticket.praca.nome.toUpperCase(), alinhar: "centro", negrito: true },
    { tipo: "texto", texto: tituloPedido(ticket), alinhar: "centro", negrito: true, grande: true },
  );
  if (tudoViagem) linhas.push({ tipo: "texto", texto: "PRA VIAGEM", alinhar: "centro", negrito: true, grande: true });
  linhas.push({ tipo: "texto", texto: `Pedido nº ${ticket.pedido.numero} · ${horaLocal(ticket.criadoEm, r.fuso)}`, alinhar: "centro" });
  if (ticket.pedido.origem === "delivery" && ticket.pedido.cliente) linhas.push({ tipo: "texto", texto: ticket.pedido.cliente, alinhar: "centro" });
  if (ticket.pedido.autor) linhas.push({ tipo: "texto", texto: `Garçom: ${ticket.pedido.autor}`, alinhar: "centro" });
  linhas.push({ tipo: "separador" });

  for (const i of ativos) {
    linhas.push({
      tipo: "texto",
      texto: `${i.quantidade}x ${i.nome}${i.paraViagem && !tudoViagem ? " [VIAGEM]" : ""}`,
      negrito: true,
      grande: true,
    });
    if (i.adicionais.length > 0) linhas.push({ tipo: "texto", texto: `  + ${resumoAdicionais(i.adicionais)}` });
    if (i.observacao) linhas.push({ tipo: "texto", texto: `  >> ${i.observacao}`, negrito: true });
    if (i.aguardando.length > 0) linhas.push({ tipo: "texto", texto: `  (aguardando ${i.aguardando.join(" e ")})` });
    if (i.depois.length > 0) linhas.push({ tipo: "texto", texto: `  depois: ${i.depois.join(", ")}` });
  }
  if (ticket.pedido.observacao) {
    linhas.push({ tipo: "separador" }, { tipo: "texto", texto: `Obs.: ${ticket.pedido.observacao}`, negrito: true });
  }
  return { linhas };
}

async function documentoConta(supabase: Cliente, comandaId: string, r: Restaurante): Promise<Documento | null> {
  const { data: c, error } = await supabase
    .from("comandas")
    .select(
      `id, pessoas, total, aberta_em,
       mesa:mesas!comandas_restaurante_id_mesa_id_fkey(numero),
       pedidos(status, itens_pedido(quantidade, nome_produto, adicionais, total, cancelado_em, criado_em)),
       pagamentos(valor, estornado_em)`,
    )
    .eq("id", comandaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;

  const itens = c.pedidos
    .filter((p) => p.status !== "cancelado")
    .flatMap((p) => p.itens_pedido)
    .filter((i) => !i.cancelado_em)
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const pago = c.pagamentos.filter((p) => !p.estornado_em).reduce((s, p) => s + p.valor, 0);

  const linhas: Linha[] = [
    { tipo: "texto", texto: r.nome, alinhar: "centro", negrito: true },
    { tipo: "texto", texto: `CONTA · MESA ${c.mesa?.numero ?? ""}`, alinhar: "centro", negrito: true, grande: true },
    { tipo: "texto", texto: dataHoraLocal(new Date().toISOString(), r.fuso), alinhar: "centro" },
    { tipo: "separador" },
  ];
  for (const i of itens) {
    linhas.push({ tipo: "colunas", esquerda: `${i.quantidade}x ${i.nome_produto}`, direita: formatarBRL(i.total) });
    const adicionais = lerAdicionais(i.adicionais);
    if (adicionais.length > 0) linhas.push({ tipo: "texto", texto: `   ${resumoAdicionais(adicionais)}` });
  }
  linhas.push({ tipo: "separador" }, { tipo: "colunas", esquerda: "TOTAL", direita: formatarBRL(c.total), negrito: true, grande: true });
  if (pago > 0) {
    linhas.push({ tipo: "colunas", esquerda: "Pago", direita: formatarBRL(pago) });
    linhas.push({ tipo: "colunas", esquerda: "Falta", direita: formatarBRL(Math.max(0, c.total - pago)), negrito: true });
  }
  if (c.pessoas && c.pessoas > 1) {
    linhas.push({ tipo: "colunas", esquerda: `Por pessoa (${c.pessoas})`, direita: formatarBRL(Math.ceil(c.total / c.pessoas)) });
  }
  linhas.push({ tipo: "espaco" }, { tipo: "texto", texto: "Não é documento fiscal", alinhar: "centro" });
  return { linhas };
}

async function documentoDelivery(supabase: Cliente, pedidoId: string, r: Restaurante): Promise<Documento | null> {
  const { data: p, error } = await supabase
    .from("pedidos")
    .select(
      `numero, status, cliente_nome, cliente_telefone, endereco, taxa_entrega, subtotal, total,
       forma_pagamento_prevista, troco_para, observacao, criado_em,
       bairro:bairros_entrega!pedidos_restaurante_id_bairro_id_fkey(nome),
       itens_pedido(quantidade, nome_produto, adicionais, observacao, total, cancelado_em, criado_em)`,
    )
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!p || p.status === "cancelado") return null;

  const e = (p.endereco ?? {}) as Record<string, string | null>;
  const linhas: Linha[] = [
    { tipo: "texto", texto: r.nome, alinhar: "centro", negrito: true },
    { tipo: "texto", texto: `DELIVERY nº ${p.numero}`, alinhar: "centro", negrito: true, grande: true },
    { tipo: "texto", texto: dataHoraLocal(p.criado_em, r.fuso), alinhar: "centro" },
    { tipo: "separador" },
    { tipo: "texto", texto: p.cliente_nome ?? "", negrito: true },
    { tipo: "texto", texto: `Tel.: ${p.cliente_telefone ?? ""}` },
    { tipo: "texto", texto: [e.rua, e.numero].filter(Boolean).join(", ") },
  ];
  if (e.complemento) linhas.push({ tipo: "texto", texto: e.complemento });
  if (p.bairro?.nome) linhas.push({ tipo: "texto", texto: `Bairro: ${p.bairro.nome}`, negrito: true });
  if (e.referencia) linhas.push({ tipo: "texto", texto: `Ref.: ${e.referencia}` });
  linhas.push({ tipo: "separador" });
  for (const i of p.itens_pedido.filter((x) => !x.cancelado_em).sort((a, b) => a.criado_em.localeCompare(b.criado_em))) {
    linhas.push({ tipo: "colunas", esquerda: `${i.quantidade}x ${i.nome_produto}`, direita: formatarBRL(i.total) });
    const adicionais = lerAdicionais(i.adicionais);
    if (adicionais.length > 0) linhas.push({ tipo: "texto", texto: `   ${resumoAdicionais(adicionais)}` });
    if (i.observacao) linhas.push({ tipo: "texto", texto: `   >> ${i.observacao}` });
  }
  linhas.push(
    { tipo: "separador" },
    { tipo: "colunas", esquerda: "Subtotal", direita: formatarBRL(p.subtotal) },
    { tipo: "colunas", esquerda: "Entrega", direita: formatarBRL(p.taxa_entrega) },
    { tipo: "colunas", esquerda: "TOTAL", direita: formatarBRL(p.total), negrito: true, grande: true },
    { tipo: "texto", texto: `Pagamento na entrega: ${nomeForma(p.forma_pagamento_prevista ?? "")}`, negrito: true },
  );
  if (p.forma_pagamento_prevista === "dinheiro" && p.troco_para) {
    linhas.push({ tipo: "texto", texto: `Troco para ${formatarBRL(p.troco_para)} (levar ${formatarBRL(p.troco_para - p.total)})` });
  }
  if (p.observacao) linhas.push({ tipo: "separador" }, { tipo: "texto", texto: `Obs.: ${p.observacao}`, negrito: true });
  return { linhas };
}

async function documentoTeste(supabase: Cliente, trabalho: Trabalho, r: Restaurante): Promise<Documento> {
  const { data: imp } = await supabase
    .from("impressoras")
    .select("nome, largura, imprime_conta, imprime_via_delivery, estacoes(nome)")
    .eq("id", trabalho.impressora_id)
    .maybeSingle();
  const funcoes = [
    ...(imp?.estacoes ?? []).map((e) => e.nome),
    ...(imp?.imprime_conta ? ["Conta"] : []),
    ...(imp?.imprime_via_delivery ? ["Via do delivery"] : []),
  ];
  return {
    linhas: [
      { tipo: "texto", texto: r.nome, alinhar: "centro", negrito: true },
      { tipo: "texto", texto: "TESTE DE IMPRESSÃO", alinhar: "centro", negrito: true, grande: true },
      { tipo: "texto", texto: dataHoraLocal(new Date().toISOString(), r.fuso), alinhar: "centro" },
      { tipo: "separador" },
      { tipo: "colunas", esquerda: "Impressora", direita: imp?.nome ?? "" },
      { tipo: "colunas", esquerda: "Papel", direita: `${imp?.largura ?? 80} mm` },
      { tipo: "texto", texto: `Imprime: ${funcoes.length > 0 ? funcoes.join(", ") : "nada configurado ainda"}` },
      { tipo: "separador" },
      { tipo: "texto", texto: "Acentos: ação, pão, café, açaí, Ç Ã É", alinhar: "centro" },
      { tipo: "texto", texto: "Letra grande", alinhar: "centro", grande: true },
      { tipo: "texto", texto: "Se você está lendo isto, está tudo certo.", alinhar: "centro" },
    ],
  };
}
