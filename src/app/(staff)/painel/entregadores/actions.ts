"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { centavosDeTexto } from "@/lib/dinheiro";
import { createClient } from "@/lib/supabase/server";
import { dadosDoFormulario, id } from "@/lib/validacao";

const entregadorSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome.").max(80),
    telefone: z
      .string()
      .default("")
      .transform((v) => v.replace(/\D/g, ""))
      .pipe(z.string().refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone com DDD.")),
    forma: z.enum(["taxa", "fixo"]),
    valor: z.string().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.forma === "fixo" && centavosDeTexto(d.valor) === null) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Informe o valor por entrega." });
    }
  });

function campos(d: z.infer<typeof entregadorSchema>) {
  return {
    nome: d.nome,
    telefone: d.telefone || null,
    recebe_taxa: d.forma === "taxa",
    valor_por_entrega: d.forma === "fixo" ? (centavosDeTexto(d.valor) ?? 0) : 0,
  };
}

export async function criarEntregador(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = entregadorSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const supabase = await createClient();
  const { error } = await supabase.from("entregadores").insert({ restaurante_id: acesso.restaurante.id, ...campos(dados.data) });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  refresh();
  return sucesso(`${dados.data.nome} cadastrado.`);
}

export async function salvarEntregador(entregadorId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(entregadorId).success) return falha("Entregador inválido.");
  const dados = entregadorSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const supabase = await createClient();
  const { error } = await supabase
    .from("entregadores")
    .update(campos(dados.data))
    .eq("id", entregadorId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  refresh();
  return sucesso("Entregador salvo.");
}

export async function alternarEntregador(entregadorId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(entregadorId).success) return falha("Entregador inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("entregadores")
    .update({ ativo: ativo === true })
    .eq("id", entregadorId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso(ativo ? "Entregador ativado." : "Entregador desativado.");
}
