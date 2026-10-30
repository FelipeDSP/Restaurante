"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { gerarCodigoPareamento, hashDe } from "@/lib/impressao/agente";
import { createClient } from "@/lib/supabase/server";
import { checkbox, dadosDoFormulario, id, textoObrigatorio } from "@/lib/validacao";

export type ResultadoCodigo = (NonNullable<ResultadoAcao> & { codigo?: string; expiraEm?: string }) | undefined;

// O banco grava o código (validade curta, sem repetir entre restaurantes); se por acaso o número
// sorteado já estiver em uso em outro lugar, sorteia de novo.
async function definirCodigo(supabase: Awaited<ReturnType<typeof createClient>>, agenteId: string) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoPareamento();
    const { data, error } = await supabase.rpc("definir_codigo_pareamento", { p_agente_id: agenteId, p_codigo_hash: hashDe(codigo) });
    if (!error && data) return { codigo, expiraEm: data };
    if (error?.code !== "23505") return { erro: error ? mensagemErroBanco(error) : "Não foi possível gerar o código." };
  }
  return { erro: "Não foi possível gerar o código. Tente de novo." };
}

// Cadastra o computador do caixa e devolve o código de 6 dígitos para digitar no app.
export async function conectarComputador(_estado: ResultadoCodigo, formData: FormData): Promise<ResultadoCodigo> {
  const acesso = await exigirPermissao("painel", "impressao");
  const dados = z.object({ nome: textoObrigatorio("o nome do computador", 80) }).safeParse({ nome: formData.get("nome") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { data: agente, error } = await supabase
    .from("agentes_impressao")
    .insert({ restaurante_id: acesso.restaurante.id, nome: dados.data.nome })
    .select("id")
    .single();
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  const resultado = await definirCodigo(supabase, agente.id);
  refresh();
  if ("erro" in resultado) return falha(resultado.erro ?? "Não foi possível gerar o código.", undefined, formData);
  return { ok: true, chave: Date.now(), codigo: resultado.codigo, expiraEm: resultado.expiraEm };
}

// Novo código para (re)parear um computador já cadastrado (ex.: reinstalou o app).
export async function gerarNovoCodigo(agenteId: string): Promise<ResultadoCodigo> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(agenteId).success) return falha("Computador inválido.");
  const supabase = await createClient();
  const { data: agente } = await supabase
    .from("agentes_impressao")
    .select("id")
    .eq("id", agenteId)
    .eq("restaurante_id", acesso.restaurante.id)
    .maybeSingle();
  if (!agente) return falha("Computador não encontrado.");
  const resultado = await definirCodigo(supabase, agente.id);
  refresh();
  if ("erro" in resultado) return falha(resultado.erro ?? "Não foi possível gerar o código.");
  return { ok: true, chave: Date.now(), codigo: resultado.codigo, expiraEm: resultado.expiraEm };
}

// Computador criado por engano ou que não existe mais. Nada da fila é apagado (só perde o vínculo).
export async function excluirComputador(agenteId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(agenteId).success) return falha("Computador inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agentes_impressao")
    .delete()
    .eq("id", agenteId)
    .eq("restaurante_id", acesso.restaurante.id)
    .select("id");
  if (error) return falha(mensagemErroBanco(error));
  if (!data.length) return falha("Computador não encontrado.");
  refresh();
  return sucesso("Computador excluído.");
}

export async function desconectarComputador(agenteId: string): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(agenteId).success) return falha("Computador inválido.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("agentes_impressao")
    .update({ ativo: false })
    .eq("id", agenteId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  // Apaga um código ainda não usado (a função confere que o computador é deste dono).
  // O tipo gerado não aceita null, mas a função aceita (null = apagar o código).
  await supabase.rpc("definir_codigo_pareamento", { p_agente_id: agenteId, p_codigo_hash: null as unknown as string });
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
    largura: z.coerce.number().pipe(z.union([z.literal(58), z.literal(80), z.literal(210)], { error: "Escolha o papel." })),
    codificacao: z.enum(["cp850", "cp1252", "sem_acentos"]),
    modo: z.enum(["escpos", "driver"]).default("escpos"),
    agente_id: z.preprocess((v) => (v === "" || v === undefined ? null : v), id.nullable()),
    imprime_conta: checkbox,
    imprime_via_delivery: checkbox,
    imprime_ao_fechar: checkbox,
    ativa: checkbox,
  })
  // Pela rede só existe o modo de comandos; o driver é do Windows.
  .transform((d) => (d.conexao === "rede" ? { ...d, modo: "escpos" as const } : d))
  .refine((d) => d.largura !== 210 || d.modo === "driver", {
    path: ["largura"],
    message: "Folha A4 só no modo \"pelo driver do Windows\" (impressora comum).",
  })
  .refine((d) => d.conexao !== "rede" || /^[\w.-]+$/.test(d.endereco), {
    path: ["endereco"],
    message: "Use o IP da impressora (ex.: 192.168.0.50).",
  });

// impressoraId null = nova.
export async function salvarImpressora(impressoraId: string | null, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
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
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(impressoraId).success) return falha("Impressora inválida.");
  const supabase = await createClient();
  const { error } = await supabase.from("impressoras").delete().eq("id", impressoraId).eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Impressora excluída.");
}

export async function imprimirTeste(impressoraId: string): Promise<ResultadoAcao> {
  await exigirPermissao("painel", "caixa_operar", "impressao");
  if (!id.safeParse(impressoraId).success) return falha("Impressora inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("imprimir_teste", { p_impressora_id: impressoraId });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Teste enviado para a fila.");
}

export async function reimprimir(filaId: string): Promise<ResultadoAcao> {
  await exigirPermissao("painel", "caixa_operar", "impressao");
  if (!id.safeParse(filaId).success) return falha("Impressão inválida.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reimprimir", { p_fila_id: filaId });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Enviado de novo para a fila.");
}

// Assistente para quem não entende de impressora: escolhe uma impressora que o app encontrou no
// computador e diz só se é de cupom (bobina) ou comum (folha A4). O resto vem pronto e o teste já sai.
const assistenteSchema = z.object({
  agenteId: id,
  nomeWindows: z.string().trim().min(1).max(200),
  tipo: z.enum(["cupom80", "cupom58", "comum"]),
  nome: z.string().trim().min(1).max(60),
  imprimeConta: z.boolean(),
  imprimeViaDelivery: z.boolean(),
  imprimeAoFechar: z.boolean(),
  pracas: z.array(id).max(30),
});

type ResultadoImpressora = NonNullable<ResultadoAcao> & { impressoraId?: string };
const erroImpressora = (mensagem: string) => falha(mensagem) as ResultadoImpressora;

export async function configurarImpressora(entrada: z.input<typeof assistenteSchema>): Promise<ResultadoImpressora> {
  const acesso = await exigirPermissao("painel", "impressao");
  const restauranteId = acesso.restaurante.id;
  const dados = assistenteSchema.safeParse(entrada);
  if (!dados.success) return erroImpressora("Escolha a impressora de novo.");
  const d = dados.data;

  const supabase = await createClient();
  // A impressora tem que ser uma das que o computador deste restaurante informou.
  const { data: agente } = await supabase
    .from("agentes_impressao")
    .select("impressoras_windows")
    .eq("id", d.agenteId)
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!agente || !Array.isArray(agente.impressoras_windows) || !agente.impressoras_windows.includes(d.nomeWindows)) {
    return erroImpressora("Essa impressora não está mais nesse computador. Confira se ele está ligado.");
  }

  // Cupom: comandos de térmica (corta o papel). Comum: pelo driver, em folha A4.
  const comum = d.tipo === "comum";
  const { data, error } = await supabase
    .from("impressoras")
    .insert({
      restaurante_id: restauranteId,
      nome: d.nome,
      conexao: "windows",
      endereco: d.nomeWindows,
      porta: 9100,
      largura: comum ? 210 : d.tipo === "cupom58" ? 58 : 80,
      codificacao: "cp850",
      modo: comum ? "driver" : "escpos",
      agente_id: d.agenteId,
      imprime_conta: d.imprimeConta,
      imprime_via_delivery: d.imprimeViaDelivery,
      imprime_ao_fechar: d.imprimeAoFechar,
      ativa: true,
    })
    .select("id")
    .single();
  if (error) return erroImpressora(error.code === "23505" ? "Já existe uma impressora com esse nome. Escolha outro nome." : mensagemErroBanco(error));

  if (d.pracas.length > 0) {
    const { error: erroLiga } = await supabase
      .from("estacoes")
      .update({ impressora_id: data.id })
      .eq("restaurante_id", restauranteId)
      .in("id", d.pracas);
    if (erroLiga) return erroImpressora("Impressora cadastrada, mas não foi possível ligar os setores. Use Editar.");
  }

  await supabase.rpc("imprimir_teste", { p_impressora_id: data.id });
  refresh();
  return { ok: true, mensagem: "Impressora pronta. Mandamos um teste.", chave: Date.now(), impressoraId: data.id };
}

// Resposta ao teste: "não saiu nada" passa a imprimir pelo driver do Windows (serve para qualquer
// impressora); "letras estranhas" troca o jeito dos acentos. Depois manda outro teste.
export async function ajustarPeloTeste(impressoraId: string, problema: "nada" | "letras"): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "impressao");
  if (!id.safeParse(impressoraId).success || !["nada", "letras"].includes(problema)) return falha("Impressora inválida.");
  const supabase = await createClient();
  const { data: imp } = await supabase
    .from("impressoras")
    .select("conexao, modo, codificacao, largura")
    .eq("id", impressoraId)
    .eq("restaurante_id", acesso.restaurante.id)
    .maybeSingle();
  if (!imp) return falha("Impressora não encontrada.");

  let mudanca: { modo?: string; codificacao?: string } | null = null;
  if (problema === "nada" && imp.conexao === "windows" && imp.modo === "escpos") mudanca = { modo: "driver" };
  if (problema === "letras" && imp.modo === "escpos") {
    const proxima = imp.codificacao === "cp850" ? "cp1252" : imp.codificacao === "cp1252" ? "sem_acentos" : null;
    if (proxima) mudanca = { codificacao: proxima };
  }
  if (!mudanca) {
    return falha(
      problema === "nada"
        ? "Confira se a impressora está ligada, com papel e conectada ao computador. No Windows, tente imprimir uma página de teste por ela."
        : "Não há outro ajuste automático. Fale com o suporte: menu do usuário › Ajuda pelo WhatsApp.",
    );
  }

  const { error } = await supabase.from("impressoras").update(mudanca).eq("id", impressoraId).eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));
  await supabase.rpc("imprimir_teste", { p_impressora_id: impressoraId });
  refresh();
  return sucesso("Ajustamos e mandamos outro teste.");
}
