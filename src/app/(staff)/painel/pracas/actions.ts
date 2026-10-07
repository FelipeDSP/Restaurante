"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

// Praças de produção (churrasqueira, chapa, bar): para onde cada pedido vai na cozinha.

const nomeSchema = z.object({ nome: textoObrigatorio("o nome", 60) });

function mensagemNome(erro: PostgrestError) {
  return erro.code === "23505" ? "Já existe uma praça com esse nome." : mensagemErroBanco(erro);
}

export async function criarPraca(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = nomeSchema.safeParse({ nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "estacoes", acesso.restaurante.id);
  const { error } = await supabase
    .from("estacoes")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome, ordem });
  if (error) return falha(mensagemNome(error), undefined, formData);

  refresh();
  return sucesso("Praça criada. Agora ligue os produtos a ela.");
}

export async function renomearPraca(pracaId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = z.object({ id, nome: textoObrigatorio("o nome", 60) }).safeParse({ id: pracaId, nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .update({ nome: dados.data.nome })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemNome(error), undefined, formData);

  refresh();
  return sucesso("Praça renomeada.");
}

export async function alternarPraca(pracaId: string, ativa: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(pracaId).success) return falha("Praça inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .update({ ativa: ativa === true })
    .eq("id", pracaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativa ? "Praça ativada." : "Praça desativada: os produtos dela deixam de ir para a cozinha.");
}

export async function moverPraca(pracaId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(pracaId).success) return falha("Praça inválida.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "estacoes", acesso.restaurante.id, pracaId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirPraca(pracaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(pracaId).success) return falha("Praça inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .delete()
    .eq("id", pracaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "Esta praça já recebeu pedidos e não pode ser excluída. Desative-a."
        : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Praça excluída.");
}
