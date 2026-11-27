"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

// Setores de produção (churrasqueira, chapa, bar): para onde cada pedido vai na cozinha.

const nomeSchema = z.object({ nome: textoObrigatorio("o nome", 60) });

function mensagemNome(erro: PostgrestError) {
  return erro.code === "23505" ? "Já existe um setor com esse nome." : mensagemErroBanco(erro);
}

export async function criarSetor(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  const dados = nomeSchema.safeParse({ nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "estacoes", acesso.restaurante.id);
  const { error } = await supabase
    .from("estacoes")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome, ordem });
  if (error) return falha(mensagemNome(error), undefined, formData);

  refresh();
  return sucesso("Setor criado. Agora ligue os produtos a ele.");
}

export async function renomearSetor(setorId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  const dados = z.object({ id, nome: textoObrigatorio("o nome", 60) }).safeParse({ id: setorId, nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .update({ nome: dados.data.nome })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemNome(error), undefined, formData);

  refresh();
  return sucesso("Setor renomeado.");
}

export async function alternarSetor(setorId: string, ativa: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(setorId).success) return falha("Setor inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .update({ ativa: ativa === true })
    .eq("id", setorId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativa ? "Setor ativado." : "Setor desativado: os produtos dele deixam de ir para a cozinha.");
}

export async function moverSetor(setorId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(setorId).success) return falha("Setor inválido.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "estacoes", acesso.restaurante.id, setorId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirSetor(setorId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(setorId).success) return falha("Setor inválido.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("estacoes")
    .delete()
    .eq("id", setorId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503"
        ? "Este setor já recebeu pedidos e não pode ser excluído. Desative-o."
        : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Setor excluído.");
}

// Quais produtos passam por este setor, aplicado pelo lado do setor. A rota do produto tem ordem
// (churrasqueira antes da chapa), então entrar por aqui coloca o setor no FIM da rota do produto;
// sair apaga aquela etapa. Quem precisa montar a sequência continua fazendo no produto.
const produtosSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Produtos inválidos." }).max(1000));

export async function aplicarSetorEmProdutos(setorId: string, produtosJson: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(setorId).success) return falha("Setor inválido.");
  const produtos = produtosSchema.safeParse(produtosJson);
  if (!produtos.success) return falha("Produtos inválidos.");

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const escolhidos = [...new Set(produtos.data)];

  // Rota atual de todo mundo que está em jogo: a deste setor e a dos produtos que vão entrar.
  const [atuais, rotas] = await Promise.all([
    supabase.from("produto_etapas").select("produto_id").eq("restaurante_id", restauranteId).eq("estacao_id", setorId),
    escolhidos.length > 0
      ? supabase.from("produto_etapas").select("produto_id, ordem").eq("restaurante_id", restauranteId).in("produto_id", escolhidos)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (atuais.error) return falha(mensagemErroBanco(atuais.error));
  if (rotas.error) return falha(mensagemErroBanco(rotas.error));

  const existentes = atuais.data.map((l) => l.produto_id);
  const remover = existentes.filter((p) => !escolhidos.includes(p));
  const incluir = escolhidos.filter((p) => !existentes.includes(p));

  if (remover.length > 0) {
    const { error } = await supabase
      .from("produto_etapas")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("estacao_id", setorId)
      .in("produto_id", remover);
    if (error) return falha(mensagemErroBanco(error));
  }

  if (incluir.length > 0) {
    const ultima = new Map<string, number>();
    for (const r of rotas.data) ultima.set(r.produto_id, Math.max(ultima.get(r.produto_id) ?? 0, r.ordem));
    // O banco só aceita ordem de 1 a 10: rota cheia é erro de cadastro, não silêncio.
    const cheios = incluir.filter((p) => (ultima.get(p) ?? 0) >= 10);
    if (cheios.length > 0) return falha("Algum produto já tem 10 etapas de preparo. Ajuste a rota pelo produto.");

    const { error } = await supabase
      .from("produto_etapas")
      .insert(incluir.map((produtoId) => ({ restaurante_id: restauranteId, produto_id: produtoId, estacao_id: setorId, ordem: (ultima.get(produtoId) ?? 0) + 1 })));
    if (error) return falha(mensagemErroBanco(error));
  }

  refresh();
  const total = escolhidos.length;
  return sucesso(total === 0 ? "Setor saiu de todos os produtos." : `Setor em ${total} ${total === 1 ? "produto" : "produtos"}.`);
}
