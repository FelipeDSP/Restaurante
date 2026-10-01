"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { dinheiro, id, textoObrigatorio } from "@/lib/validacao";

const bairroSchema = z.object({
  nome: textoObrigatorio("o nome do bairro", 80),
  taxa: dinheiro("Taxa"),
});

function mensagemBairro(codigo: string, padrao: string) {
  return codigo === "23505" ? "Já existe um bairro com esse nome." : padrao;
}

export async function criarBairro(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = bairroSchema.safeParse({ nome: formData.get("nome"), taxa: formData.get("taxa") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("bairros_entrega")
    .insert({ restaurante_id: acesso.restaurante.id, ...dados.data });
  if (error) return falha(mensagemBairro(error.code, mensagemErroBanco(error)), undefined, formData);

  refresh();
  return sucesso(`Bairro ${dados.data.nome} adicionado.`);
}

export async function salvarBairro(bairroId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = bairroSchema
    .extend({ id })
    .safeParse({ id: bairroId, nome: formData.get("nome"), taxa: formData.get("taxa") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("bairros_entrega")
    .update({ nome: dados.data.nome, taxa: dados.data.taxa })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemBairro(error.code, mensagemErroBanco(error)), undefined, formData);

  refresh();
  return sucesso("Bairro atualizado.");
}

export async function alternarBairro(bairroId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(bairroId).success) return falha("Bairro inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bairros_entrega")
    .update({ ativo: ativo === true })
    .eq("id", bairroId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativo ? "Bairro ativado." : "Bairro desativado.");
}

export async function excluirBairro(bairroId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(bairroId).success) return falha("Bairro inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bairros_entrega")
    .delete()
    .eq("id", bairroId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503" ? "Este bairro já tem pedidos e não pode ser excluído. Desative-o." : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Bairro excluído.");
}
