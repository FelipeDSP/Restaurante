"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { dadosDoFormulario, dinheiro, id, textoObrigatorio } from "@/lib/validacao";

// Grupos de opções ("Ponto da carne", "Adicionais") e suas opções. Só o dono mexe.

const inteiro = (rotulo: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: use um número inteiro.`)
    .min(min, `${rotulo}: mínimo ${min}.`)
    .max(max, `${rotulo}: máximo ${max}.`);

const grupoSchema = z
  .object({
    nome: textoObrigatorio("o nome do grupo", 80),
    minimo: inteiro("Mínimo", 0, 20),
    maximo: inteiro("Máximo", 1, 20),
  })
  .refine((g) => g.minimo <= g.maximo, { path: ["maximo"], message: "O máximo não pode ser menor que o mínimo." });

const opcaoSchema = z.object({
  nome: textoObrigatorio("o nome da opção", 80),
  preco: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), dinheiro("Preço")),
});

export async function criarGrupo(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = grupoSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "grupos_adicionais", acesso.restaurante.id);
  const { error } = await supabase
    .from("grupos_adicionais")
    .insert({ restaurante_id: acesso.restaurante.id, ...dados.data, ordem });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Grupo criado. Agora cadastre as opções.");
}

export async function salvarGrupo(grupoId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");
  const dados = grupoSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos_adicionais")
    .update(dados.data)
    .eq("id", grupoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Grupo salvo.");
}

export async function alternarGrupo(grupoId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos_adicionais")
    .update({ ativo: ativo === true })
    .eq("id", grupoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativo ? "Grupo ativado." : "Grupo desativado: some dos produtos até ser ativado de novo.");
}

export async function moverGrupo(grupoId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "grupos_adicionais", acesso.restaurante.id, grupoId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

// Apaga o grupo, suas opções e as ligações com produtos (pedidos antigos guardam o retrato).
export async function excluirGrupo(grupoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos_adicionais")
    .delete()
    .eq("id", grupoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Grupo excluído.");
}

export async function criarOpcao(grupoId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");
  const dados = opcaoSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "adicionais", acesso.restaurante.id, { coluna: "grupo_id", valor: grupoId });
  const { error } = await supabase
    .from("adicionais")
    .insert({ restaurante_id: acesso.restaurante.id, grupo_id: grupoId, ...dados.data, ordem });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Opção adicionada.");
}

export async function salvarOpcao(opcaoId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(opcaoId).success) return falha("Opção inválida.");
  const dados = opcaoSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("adicionais")
    .update(dados.data)
    .eq("id", opcaoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Opção salva.");
}

export async function alternarOpcao(opcaoId: string, disponivel: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(opcaoId).success) return falha("Opção inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("adicionais")
    .update({ disponivel: disponivel === true })
    .eq("id", opcaoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return undefined;
}

export async function moverOpcao(opcaoId: string, grupoId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(opcaoId).success || !id.safeParse(grupoId).success) return falha("Opção inválida.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "adicionais", acesso.restaurante.id, opcaoId, direcao === "cima" ? "cima" : "baixo", {
    coluna: "grupo_id",
    valor: grupoId,
  });
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirOpcao(opcaoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(opcaoId).success) return falha("Opção inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("adicionais")
    .delete()
    .eq("id", opcaoId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso("Opção excluída.");
}
