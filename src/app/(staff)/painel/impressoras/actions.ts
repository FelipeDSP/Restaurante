"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirAcesso, exigirDono } from "@/lib/auth/dal";
import { gerarCodigoPareamento, hashDe, VALIDADE_CODIGO_MIN } from "@/lib/impressao/agente";
import { createClient } from "@/lib/supabase/server";
import { checkbox, dadosDoFormulario, id, textoObrigatorio } from "@/lib/validacao";

export type ResultadoCodigo = (NonNullable<ResultadoAcao> & { codigo?: string; expiraEm?: string }) | undefined;

function novoCodigo() {
  const codigo = gerarCodigoPareamento();
  const expiraEm = new Date(Date.now() + VALIDADE_CODIGO_MIN * 60_000).toISOString();
  return { codigo, expiraEm, campos: { codigo_hash: hashDe(codigo), codigo_expira_em: expiraEm } };
}

// Cadastra o computador do caixa e devolve o código de 6 dígitos para digitar no app.
export async function conectarComputador(_estado: ResultadoCodigo, formData: FormData): Promise<ResultadoCodigo> {
  const acesso = await exigirDono();
  const dados = z.object({ nome: textoObrigatorio("o nome do computador", 80) }).safeParse({ nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const { codigo, expiraEm, campos } = novoCodigo();
  const supabase = await createClient();
  const { error } = await supabase
    .from("agentes_impressao")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome, ...campos });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return { ok: true, chave: Date.now(), codigo, expiraEm };
}

// Novo código para (re)parear um computador já cadastrado (ex.: reinstalou o app).
export async function gerarNovoCodigo(agenteId: string): Promise<ResultadoCodigo> {
  const acesso = await exigirDono();
  if (!id.safeParse(agenteId).success) return falha("Computador inválido.");
  const { codigo, expiraEm, campos } = novoCodigo();
  const supabase = await createClient();
  const { error } = await supabase
    .from("agentes_impressao")
    .update({ ...campos, ativo: true })
    .eq("id", agenteId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return { ok: true, chave: Date.now(), codigo, expiraEm };
}

export async function desconectarComputador(agenteId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(agenteId).success) return falha("Computador inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("agentes_impressao")
    .update({ ativo: false, codigo_hash: null, codigo_expira_em: null })
    .eq("id", agenteId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Computador desconectado: ele não imprime mais até ser pareado de novo.");
}

const listaIds = z.preprocess((v) => {
  try {
    return JSON.parse(typeof v === "string" && v ? v : "[]");
  } catch {
    return null;
  }
}, z.array(id).max(30));

const impressoraSchema = z
  .object({
    nome: textoObrigatorio("o nome", 60),
    conexao: z.enum(["rede", "windows"], { error: "Escolha a conexão." }),
    endereco: textoObrigatorio("o endereço", 200),
    porta: z.coerce.number().int().min(1).max(65535).default(9100),
    largura: z.coerce.number().pipe(z.union([z.literal(58), z.literal(80)], { error: "Papel de 58 ou 80 mm." })),
    codificacao: z.enum(["cp850", "cp1252", "sem_acentos"]),
    modo: z.enum(["escpos", "driver"]).default("escpos"),
    agente_id: z.preprocess((v) => (v === "" || v === undefined ? null : v), id.nullable()),
    imprime_conta: checkbox,
    imprime_via_delivery: checkbox,
    ativa: checkbox,
  })
  // Pela rede só existe o modo de comandos; o driver é do Windows.
  .transform((d) => (d.conexao === "rede" ? { ...d, modo: "escpos" as const } : d))
  .refine((d) => d.conexao !== "rede" || /^[\w.-]+$/.test(d.endereco), {
    path: ["endereco"],
    message: "Use o IP da impressora (ex.: 192.168.0.50).",
  });

// impressoraId null = nova.
export async function salvarImpressora(impressoraId: string | null, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const restauranteId = acesso.restaurante.id;
  const dados = impressoraSchema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);
  const pracas = listaIds.safeParse(formData.get("pracas"));
  if (!pracas.success) return falha("Praças inválidas.", undefined, formData);

  const supabase = await createClient();
  let idImpressora = impressoraId;
  if (impressoraId) {
    if (!id.safeParse(impressoraId).success) return falha("Impressora inválida.", undefined, formData);
    const { error } = await supabase.from("impressoras").update(dados.data).eq("id", impressoraId).eq("restaurante_id", restauranteId);
    if (error) return falha(error.code === "23505" ? "Já existe uma impressora com esse nome." : mensagemErroBanco(error), undefined, formData);
  } else {
    const { data, error } = await supabase
      .from("impressoras")
      .insert({ ...dados.data, restaurante_id: restauranteId })
      .select("id")
      .single();
    if (error) return falha(error.code === "23505" ? "Já existe uma impressora com esse nome." : mensagemErroBanco(error), undefined, formData);
    idImpressora = data.id;
  }

  // Praças desta impressora: liga as escolhidas e solta as que saíram.
  const { error: erroSolta } = await supabase
    .from("estacoes")
    .update({ impressora_id: null })
    .eq("restaurante_id", restauranteId)
    .eq("impressora_id", idImpressora!);
  const { error: erroLiga } =
    pracas.data.length > 0
      ? await supabase.from("estacoes").update({ impressora_id: idImpressora }).eq("restaurante_id", restauranteId).in("id", pracas.data)
      : { error: null };
  if (erroSolta || erroLiga) return falha("Impressora salva, mas não foi possível ligar as praças.", undefined, formData);

  refresh();
  return sucesso(impressoraId ? "Impressora salva." : "Impressora cadastrada. Use \"Testar\" para conferir.");
}

export async function excluirImpressora(impressoraId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(impressoraId).success) return falha("Impressora inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("impressoras").delete().eq("id", impressoraId).eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Impressora excluída.");
}

export async function imprimirTeste(impressoraId: string): Promise<ResultadoAcao> {
  await exigirAcesso("painel");
  if (!id.safeParse(impressoraId).success) return falha("Impressora inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("imprimir_teste", { p_impressora_id: impressoraId });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Teste enviado para a fila.");
}

export async function reimprimir(filaId: string): Promise<ResultadoAcao> {
  await exigirAcesso("painel");
  if (!id.safeParse(filaId).success) return falha("Impressão inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reimprimir", { p_fila_id: filaId });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Enviado de novo para a fila.");
}
