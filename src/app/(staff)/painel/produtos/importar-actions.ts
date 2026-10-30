"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const linhaSchema = z.object({
  categoria: z.string().trim().min(1).max(80),
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(500).nullable(),
  preco: z.number().int().min(0).max(100_000_000),
});

// Mesmo nome = mesmo produto (sem diferença de maiúsculas e espaços).
const chave = (texto: string) => texto.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

// Importação da planilha: cria categorias e produtos novos; produto que já existe (mesmo nome)
// só tem preço e descrição atualizados (reajuste em massa). Nada é apagado.
export async function importarProdutos(linhas: z.input<typeof linhaSchema>[]): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "cardapio");
  const restauranteId = acesso.restaurante.id;
  const dados = z.array(linhaSchema).min(1, "A planilha não tem produtos.").max(1000, "Até 1000 produtos por vez.").safeParse(linhas);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Planilha inválida.");

  // A última linha com o mesmo nome vale.
  const porNome = new Map<string, z.output<typeof linhaSchema>>();
  for (const l of dados.data) porNome.set(chave(l.nome), l);

  const supabase = await createClient();
  const [{ data: categorias, error: e1 }, { data: produtos, error: e2 }] = await Promise.all([
    supabase.from("categorias").select("id, nome, ordem").eq("restaurante_id", restauranteId),
    supabase.from("produtos").select("id, nome, categoria_id, preco, descricao, ordem").eq("restaurante_id", restauranteId),
  ]);
  if (e1 || e2) return falha("Não foi possível ler o cardápio atual. Tente de novo.");

  // Categorias que faltam, na ordem em que aparecem na planilha.
  const idCategoria = new Map(categorias.map((c) => [chave(c.nome), c.id]));
  let ordemCategoria = Math.max(0, ...categorias.map((c) => c.ordem));
  const novasCategorias: { restaurante_id: string; nome: string; ordem: number }[] = [];
  for (const l of porNome.values()) {
    const k = chave(l.categoria);
    if (!idCategoria.has(k) && !novasCategorias.some((c) => chave(c.nome) === k)) {
      novasCategorias.push({ restaurante_id: restauranteId, nome: l.categoria.replace(/\s+/g, " "), ordem: ++ordemCategoria });
    }
  }
  if (novasCategorias.length > 0) {
    const { data: criadas, error } = await supabase.from("categorias").insert(novasCategorias).select("id, nome");
    if (error) return falha(mensagemErroBanco(error));
    for (const c of criadas) idCategoria.set(chave(c.nome), c.id);
  }

  const existentes = new Map(produtos.map((p) => [chave(p.nome), p]));
  const ordemPorCategoria = new Map<string, number>();
  for (const p of produtos) ordemPorCategoria.set(p.categoria_id, Math.max(ordemPorCategoria.get(p.categoria_id) ?? 0, p.ordem));

  const novos: { restaurante_id: string; categoria_id: string; nome: string; descricao: string | null; preco: number; ordem: number }[] = [];
  const atualizar: { id: string; restaurante_id: string; categoria_id: string; nome: string; descricao: string | null; preco: number }[] = [];
  for (const l of porNome.values()) {
    const atual = existentes.get(chave(l.nome));
    if (atual) {
      const descricao = l.descricao ?? atual.descricao;
      if (atual.preco !== l.preco || descricao !== atual.descricao) {
        atualizar.push({ id: atual.id, restaurante_id: restauranteId, categoria_id: atual.categoria_id, nome: atual.nome, descricao, preco: l.preco });
      }
      continue;
    }
    const categoriaId = idCategoria.get(chave(l.categoria))!;
    const ordem = (ordemPorCategoria.get(categoriaId) ?? 0) + 1;
    ordemPorCategoria.set(categoriaId, ordem);
    novos.push({ restaurante_id: restauranteId, categoria_id: categoriaId, nome: l.nome.replace(/\s+/g, " "), descricao: l.descricao, preco: l.preco, ordem });
  }

  if (novos.length > 0) {
    const { error } = await supabase.from("produtos").insert(novos);
    if (error) return falha(mensagemErroBanco(error));
  }
  if (atualizar.length > 0) {
    const { error } = await supabase.from("produtos").upsert(atualizar, { onConflict: "id" });
    if (error) return falha(`Produtos novos criados, mas os preços não foram atualizados: ${mensagemErroBanco(error)}`);
  }

  refresh();
  const partes = [
    novos.length > 0 ? `${novos.length} ${novos.length === 1 ? "produto novo" : "produtos novos"}` : null,
    atualizar.length > 0 ? `${atualizar.length} ${atualizar.length === 1 ? "atualizado" : "atualizados"}` : null,
    novasCategorias.length > 0 ? `${novasCategorias.length} ${novasCategorias.length === 1 ? "categoria nova" : "categorias novas"}` : null,
  ].filter(Boolean);
  return sucesso(partes.length > 0 ? `Importado: ${partes.join(", ")}.` : "Nada mudou: o cardápio já estava igual à planilha.");
}
