"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso } from "@/lib/auth/dal";
import { novoRegistro } from "@/lib/supabase/insercao";
import { createClient } from "@/lib/supabase/server";
import { dinheiro, id, textoOpcional } from "@/lib/validacao";

export async function abrirCaixa(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
  const dados = z.object({ valor_inicial: dinheiro("Troco inicial") }).safeParse({
    valor_inicial: formData.get("valor_inicial"),
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("caixa_sessoes")
    .insert(novoRegistro("caixa_sessoes", { restaurante_id: acesso.restaurante.id, valor_inicial: dados.data.valor_inicial }));
  if (error) {
    return falha(error.code === "23505" ? "Já existe um caixa aberto." : mensagemErroBanco(error), undefined, formData);
  }

  refresh();
  return sucesso("Caixa aberto.");
}

export async function fecharCaixa(sessaoId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
  const dados = z
    .object({ sessaoId: id, valor_contado: dinheiro("Valor contado"), observacao: textoOpcional(500) })
    .safeParse({ sessaoId, valor_contado: formData.get("valor_contado"), observacao: formData.get("observacao") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  // fechada_em/fechada_por são definidos pelo trigger; ele também recusa se houver comanda aberta.
  const { data, error } = await supabase
    .from("caixa_sessoes")
    .update({
      fechada_em: new Date().toISOString(),
      valor_contado: dados.data.valor_contado,
      observacao: dados.data.observacao,
    })
    .eq("id", dados.data.sessaoId)
    .eq("restaurante_id", acesso.restaurante.id)
    .is("fechada_em", null)
    .select("id");
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  if (!data.length) return falha("Caixa não encontrado ou já fechado.", undefined, formData);

  redirect(`/painel/caixa/${dados.data.sessaoId}`);
}

// Sangria (tirar dinheiro da gaveta) ou suprimento (colocar troco). O banco liga à sessão aberta.
export async function registrarMovimento(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirAcesso("painel");
  const dados = z
    .object({
      tipo: z.enum(["sangria", "suprimento"], { error: "Escolha sangria ou suprimento." }),
      valor: dinheiro("Valor").refine((v) => v > 0, "Informe um valor maior que zero."),
      motivo: z.string().trim().min(3, "Informe o motivo.").max(200),
    })
    .safeParse({ tipo: formData.get("tipo"), valor: formData.get("valor"), motivo: formData.get("motivo") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("movimentos_caixa")
    .insert(novoRegistro("movimentos_caixa", { restaurante_id: acesso.restaurante.id, ...dados.data }));
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso(dados.data.tipo === "sangria" ? "Sangria registrada." : "Suprimento registrado.");
}
