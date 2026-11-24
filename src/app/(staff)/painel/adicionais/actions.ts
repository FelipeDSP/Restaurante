"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
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
    // Caixa de seleção: só vem no formulário quando marcada.
    repetir: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .refine((g) => g.minimo <= g.maximo, { path: ["maximo"], message: "O máximo não pode ser menor que o mínimo." });

const opcaoSchema = z.object({
  nome: textoObrigatorio("o nome da opção", 80),
  preco: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? "0" : v), dinheiro("Preço")),
});

export async function criarGrupo(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "grupos_adicionais", acesso.restaurante.id, grupoId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

// Apaga o grupo, suas opções e as ligações com produtos (pedidos antigos guardam o retrato).
export async function excluirGrupo(grupoId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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
  const acesso = await exigirPermissao("painel", "cardapio");
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

// Aplicar o grupo direto pelo lado dele: em quais produtos ele entra. Antes só dava para ligar
// abrindo produto por produto, e o grupo "Ponto da carne" tinha que ser repetido em cada burger.
const produtosSchema = z.preprocess((valor) => {
  try {
    return JSON.parse(typeof valor === "string" && valor ? valor : "[]");
  } catch {
    return null;
  }
}, z.array(id, { error: "Produtos inválidos." }).max(1000));

export async function aplicarGrupoEmProdutos(grupoId: string, produtosJson: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  if (!id.safeParse(grupoId).success) return falha("Grupo inválido.");
  const produtos = produtosSchema.safeParse(produtosJson);
  if (!produtos.success) return falha("Produtos inválidos.");

  const restauranteId = acesso.restaurante.id;
  const supabase = await createClient();
  const escolhidos = [...new Set(produtos.data)];

  const { data: atuais, error } = await supabase
    .from("produtos_grupos_adicionais")
    .select("produto_id")
    .eq("restaurante_id", restauranteId)
    .eq("grupo_id", grupoId);
  if (error) return falha(mensagemErroBanco(error));

  const existentes = atuais.map((l) => l.produto_id);
  const remover = existentes.filter((p) => !escolhidos.includes(p));
  const incluir = escolhidos.filter((p) => !existentes.includes(p));

  if (remover.length > 0) {
    const { error: erro } = await supabase
      .from("produtos_grupos_adicionais")
      .delete()
      .eq("restaurante_id", restauranteId)
      .eq("grupo_id", grupoId)
      .in("produto_id", remover);
    if (erro) return falha(mensagemErroBanco(erro));
  }
  if (incluir.length > 0) {
    const { error: erro } = await supabase
      .from("produtos_grupos_adicionais")
      .insert(incluir.map((produtoId) => ({ restaurante_id: restauranteId, produto_id: produtoId, grupo_id: grupoId })));
    if (erro) return falha(mensagemErroBanco(erro));
  }

  refresh();
  const total = escolhidos.length;
  return sucesso(total === 0 ? "Grupo tirado de todos os produtos." : `Grupo em ${total} ${total === 1 ? "produto" : "produtos"}.`);
}
