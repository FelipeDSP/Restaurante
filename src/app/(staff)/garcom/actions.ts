"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { formatarBRL } from "@/lib/dinheiro";
import { novoRegistro } from "@/lib/supabase/insercao";
import { createClient } from "@/lib/supabase/server";
import { id } from "@/lib/validacao";

// Todas as ações filtram pelo restaurante ativo; a RLS e os triggers fazem a validação final
// (caixa aberto, comanda aberta, preço do cadastro, quem registrou).

export async function abrirComanda(mesaId: string, pessoas: number | null): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ mesaId: id, pessoas: z.number().int().min(1).max(100).nullable() })
    .safeParse({ mesaId, pessoas });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .insert(novoRegistro("comandas", { restaurante_id: acesso.restaurante.id, mesa_id: dados.data.mesaId, pessoas: dados.data.pessoas }));
  if (error) {
    return falha(error.code === "23505" ? "Esta mesa já tem uma comanda aberta." : mensagemErroBanco(error));
  }

  refresh();
  return sucesso("Comanda aberta.");
}

const itensSchema = z
  .array(
    z.object({
      produtoId: id,
      quantidade: z.number().int().min(1).max(99),
      observacao: z.string().trim().max(300).nullable(),
      adicionais: z.array(id).max(30),
      paraViagem: z.boolean(),
    }),
  )
  .min(1, "Escolha pelo menos um item.")
  .max(50);

export async function lancarItens(
  comandaId: string,
  itens: { produtoId: string; quantidade: number; observacao: string | null; adicionais: string[]; paraViagem: boolean }[],
  // lote: id do envio (toque duplo ou resposta perdida não lança em dobro);
  // totalEsperado: o total mostrado na tela (preço que mudou é avisado, não cobrado em silêncio).
  envio?: { lote: string; totalEsperado: number },
): Promise<ResultadoAcao> {
  await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");
  const envioOk = z.object({ lote: id, totalEsperado: z.number().int().min(0) }).optional().safeParse(envio);
  if (!envioOk.success) return falha("Dados inválidos.");
  const dados = itensSchema.safeParse(itens);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Itens inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lancar_itens_comanda", {
    p_comanda_id: comandaId,
    p_itens: dados.data.map((i) => ({
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      observacao: i.observacao || null,
      adicionais: i.adicionais,
      para_viagem: i.paraViagem,
    })),
    p_lote: envioOk.data?.lote,
    p_total_esperado: envioOk.data?.totalEsperado,
  });
  if (error) return falha(mensagemErroBanco(error));

  const quantidade = dados.data.reduce((soma, i) => soma + i.quantidade, 0);
  const numero = (data as { numero?: number } | null)?.numero;
  refresh();
  return sucesso(`Pedido${numero ? ` nº ${numero}` : ""} enviado: ${quantidade} ${quantidade === 1 ? "item" : "itens"}.`);
}

export async function alterarItem(itemId: string, quantidade: number, observacao: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ itemId: id, quantidade: z.number().int().min(1).max(99), observacao: z.string().trim().max(300) })
    .safeParse({ itemId, quantidade, observacao });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("itens_pedido")
    .update({ quantidade: dados.data.quantidade, observacao: dados.data.observacao || null })
    .eq("id", dados.data.itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Item atualizado.");
}

export async function cancelarItem(itemId: string, motivo: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ itemId: id, motivo: z.string().trim().min(3, "Informe o motivo.").max(500) })
    .safeParse({ itemId, motivo });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("itens_pedido")
    .update({ cancelado_em: new Date().toISOString(), motivo_cancelamento: dados.data.motivo })
    .eq("id", dados.data.itemId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Item cancelado.");
}

export async function alterarStatusConta(comandaId: string, contaPedida: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: contaPedida ? "conta_pedida" : "aberta" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .in("status", ["aberta", "conta_pedida"]);
  if (error) return falha(mensagemErroBanco(error));

  // Pediu a conta: sai sozinha na impressora de conta, se houver.
  let impressa = 0;
  if (contaPedida) {
    const { data } = await supabase.rpc("imprimir_conta", { p_comanda_id: comandaId });
    impressa = data ?? 0;
  }

  refresh();
  return sucesso(contaPedida ? (impressa > 0 ? "Conta pedida e enviada para a impressora." : "Conta pedida.") : "Comanda reaberta.");
}

export async function imprimirConta(comandaId: string): Promise<ResultadoAcao> {
  await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("imprimir_conta", { p_comanda_id: comandaId });
  if (error) return falha(mensagemErroBanco(error));
  if (!data) return falha("Nenhuma impressora está marcada para imprimir a conta (Painel > Impressoras).");
  return sucesso("Conta enviada para a impressora.");
}

const FORMAS = ["dinheiro", "pix", "credito", "debito", "outro"] as const;

export async function registrarPagamento(comandaId: string, valor: number, forma: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ comandaId: id, valor: z.number().int().min(1, "Informe o valor."), forma: z.enum(FORMAS) })
    .safeParse({ comandaId, valor, forma });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from("pagamentos").insert(
    novoRegistro("pagamentos", {
      restaurante_id: acesso.restaurante.id,
      comanda_id: dados.data.comandaId,
      valor: dados.data.valor,
      forma: dados.data.forma,
    }),
  );
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(`Pagamento de ${formatarBRL(dados.data.valor)} registrado.`);
}

// Pagamento combinado (ex.: parte no Pix, parte no cartão): todas as formas num envio só.
// Um insert com várias linhas é uma transação: o trigger confere cada parte contra o que falta
// (somando as anteriores do mesmo envio) e, se uma passar do saldo, nenhuma é gravada.
export async function registrarPagamentos(comandaId: string, partes: { valor: number; forma: string }[]): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({
      comandaId: id,
      partes: z
        .array(z.object({ valor: z.number().int().min(1, "Informe o valor de cada forma."), forma: z.enum(FORMAS) }))
        .min(1, "Informe o pagamento.")
        .max(10, "Formas demais."),
    })
    .safeParse({ comandaId, partes });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase.from("pagamentos").insert(
    dados.data.partes.map((p) =>
      novoRegistro("pagamentos", {
        restaurante_id: acesso.restaurante.id,
        comanda_id: dados.data.comandaId,
        valor: p.valor,
        forma: p.forma,
      }),
    ),
  );
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  const total = dados.data.partes.reduce((soma, p) => soma + p.valor, 0);
  return sucesso(
    dados.data.partes.length > 1
      ? `${dados.data.partes.length} pagamentos registrados (${formatarBRL(total)}).`
      : `Pagamento de ${formatarBRL(total)} registrado.`,
  );
}

// Chegou ou saiu gente da mesa: muda a quantidade de pessoas da comanda aberta.
export async function alterarPessoas(comandaId: string, pessoas: number): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ comandaId: id, pessoas: z.number().int().min(1, "Pelo menos 1 pessoa.").max(100, "Máximo de 100 pessoas.") })
    .safeParse({ comandaId, pessoas });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comandas")
    .update({ pessoas: dados.data.pessoas })
    .eq("id", dados.data.comandaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .in("status", ["aberta", "conta_pedida"])
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Comanda não encontrada ou já fechada.");

  refresh();
  return sucesso(`Mesa com ${dados.data.pessoas} ${dados.data.pessoas === 1 ? "pessoa" : "pessoas"}.`);
}

// Tirar ou voltar a cobrar o serviço ou o couvert de uma mesa (ex.: cliente não quer pagar os 10%).
export async function alterarCobranca(comandaId: string, tipo: "servico" | "couvert", cobrar: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  const dados = z
    .object({ comandaId: id, tipo: z.enum(["servico", "couvert"]), cobrar: z.boolean() })
    .safeParse({ comandaId, tipo, cobrar });
  if (!dados.success) return falha("Dados inválidos.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comandas")
    .update(dados.data.tipo === "servico" ? { cobrar_servico: dados.data.cobrar } : { cobrar_couvert: dados.data.cobrar })
    .eq("id", dados.data.comandaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .in("status", ["aberta", "conta_pedida"])
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Comanda não encontrada ou já fechada.");

  refresh();
  const nome = dados.data.tipo === "servico" ? "Serviço" : "Couvert";
  return sucesso(dados.data.cobrar ? `${nome} cobrado.` : `${nome} retirado.`);
}

export async function estornarPagamento(pagamentoId: string, motivo: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!acesso.permissoes.includes("caixa_estornar")) return falha("Sem permissão para estornar.");
  const dados = z
    .object({ pagamentoId: id, motivo: z.string().trim().min(3, "Informe o motivo do estorno.").max(500) })
    .safeParse({ pagamentoId, motivo });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("pagamentos")
    .update({ estornado_em: new Date().toISOString(), motivo_estorno: dados.data.motivo })
    .eq("id", dados.data.pagamentoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Pagamento estornado.");
}

export async function fecharComanda(comandaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: "fechada" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Comanda fechada. Mesa liberada.");
}

export async function cancelarComanda(comandaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!acesso.permissoes.includes("comandas_gerenciar")) return falha("Sem permissão para cancelar a comanda.");
  if (!id.safeParse(comandaId).success) return falha("Comanda inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("comandas")
    .update({ status: "cancelada" })
    .eq("id", comandaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Comanda cancelada. Mesa liberada.");
}

// Cozinha e churrasqueira não têm tela (gordura): quem retira o prato marca a praça como pronta
// pelo app do garçom. Mesmo efeito da tela da cozinha: libera a próxima praça, avisa o garçom da
// mesa e, no delivery, a última praça pronta deixa o pedido "pronto". Quem e quando vêm do banco.
export async function marcarTicketPraca(tarefaId: string, status: "pronto" | "pendente"): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(tarefaId).success || (status !== "pronto" && status !== "pendente")) return falha("Ticket inválido.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefas_producao")
    .update({ status })
    .eq("id", tarefaId)
    .eq("restaurante_id", acesso.restaurante.id)
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Ticket não encontrado.");

  refresh();
  return status === "pronto" ? sucesso("Marcado como pronto.") : sucesso("Voltou para preparo.");
}

// O garçom responde ao chamado do painel ("Vou"): quem chamou recebe o aviso; a hora vem do banco.
export async function atenderChamado(chamadoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("garcom");
  if (!id.safeParse(chamadoId).success) return falha("Chamado inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("chamados_garcom")
    .update({ atendido_em: new Date().toISOString() })
    .eq("id", chamadoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .eq("garcom_id", acesso.membroId)
    .is("atendido_em", null);
  if (error) return falha(mensagemErroBanco(error));
  return sucesso();
}
