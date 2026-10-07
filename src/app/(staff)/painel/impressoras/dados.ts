import "server-only";

import { createClient } from "@/lib/supabase/server";

export type Computador = {
  id: string;
  nome: string;
  situacao: "online" | "offline" | "aguardando" | "desconectado";
  ultimoContatoEm: string | null;
  pareadoEm: string | null;
  versao: string | null;
  impressorasWindows: string[];
};

export type Impressora = {
  id: string;
  nome: string;
  conexao: "rede" | "windows";
  endereco: string;
  porta: number;
  largura: 58 | 80;
  codificacao: "cp850" | "cp1252" | "sem_acentos";
  modo: "escpos" | "driver";
  agenteId: string | null;
  imprimeConta: boolean;
  imprimeViaDelivery: boolean;
  ativa: boolean;
  pracas: string[];
  ultimoSucessoEm: string | null;
  ultimoErro: string | null;
  ultimoErroEm: string | null;
};

export type Impressao = {
  id: string;
  tipo: "producao" | "conta" | "delivery" | "cancelamento" | "teste";
  status: "pendente" | "imprimindo" | "impresso" | "erro";
  impressora: string;
  erro: string | null;
  criadoEm: string;
  impressoEm: string | null;
  tentativas: number;
};

// "online" = falou com o servidor nos últimos 30 s (o app chama a cada ~2 s).
const LIMITE_ONLINE_MS = 30_000;

export async function carregarImpressao(restauranteId: string) {
  const supabase = await createClient();
  const agora = Date.now();
  const [agentes, impressoras, pracas, fila] = await Promise.all([
    supabase
      .from("agentes_impressao")
      .select("id, nome, ativo, pareado_em, ultimo_contato_em, versao, impressoras_windows")
      .eq("restaurante_id", restauranteId)
      .order("criado_em"),
    supabase
      .from("impressoras")
      .select(
        "id, nome, conexao, endereco, porta, largura, codificacao, modo, agente_id, imprime_conta, imprime_via_delivery, ativa, ultimo_sucesso_em, ultimo_erro, ultimo_erro_em, estacoes!estacoes_restaurante_id_impressora_id_fkey(id)",
      )
      .eq("restaurante_id", restauranteId)
      .order("nome"),
    supabase.from("estacoes").select("id, nome").eq("restaurante_id", restauranteId).eq("ativa", true).order("ordem"),
    supabase
      .from("fila_impressao")
      .select("id, tipo, status, erro, criado_em, impresso_em, tentativas, impressora:impressoras!fila_impressao_restaurante_id_impressora_id_fkey(nome)")
      .eq("restaurante_id", restauranteId)
      .order("criado_em", { ascending: false })
      .limit(20),
  ]);
  for (const r of [agentes, impressoras, pracas, fila]) if (r.error) throw new Error(r.error.message);

  const computadores: Computador[] = (agentes.data ?? []).map((a) => ({
    id: a.id,
    nome: a.nome,
    situacao: !a.ativo
      ? "desconectado"
      : !a.pareado_em
        ? "aguardando"
        : a.ultimo_contato_em && agora - new Date(a.ultimo_contato_em).getTime() < LIMITE_ONLINE_MS
          ? "online"
          : "offline",
    ultimoContatoEm: a.ultimo_contato_em,
    pareadoEm: a.pareado_em,
    versao: a.versao,
    impressorasWindows: Array.isArray(a.impressoras_windows) ? a.impressoras_windows.filter((x): x is string => typeof x === "string") : [],
  }));

  return {
    computadores,
    impressoras: (impressoras.data ?? []).map(
      (i): Impressora => ({
        id: i.id,
        nome: i.nome,
        conexao: i.conexao as Impressora["conexao"],
        endereco: i.endereco,
        porta: i.porta,
        largura: i.largura === 58 ? 58 : 80,
        codificacao: i.codificacao as Impressora["codificacao"],
        modo: i.modo as Impressora["modo"],
        agenteId: i.agente_id,
        imprimeConta: i.imprime_conta,
        imprimeViaDelivery: i.imprime_via_delivery,
        ativa: i.ativa,
        pracas: i.estacoes.map((e) => e.id),
        ultimoSucessoEm: i.ultimo_sucesso_em,
        ultimoErro: i.ultimo_erro,
        ultimoErroEm: i.ultimo_erro_em,
      }),
    ),
    pracas: pracas.data ?? [],
    fila: (fila.data ?? []).map(
      (f): Impressao => ({
        id: f.id,
        tipo: f.tipo as Impressao["tipo"],
        status: f.status as Impressao["status"],
        impressora: f.impressora?.nome ?? "",
        erro: f.erro,
        criadoEm: f.criado_em,
        impressoEm: f.impresso_em,
        tentativas: f.tentativas,
      }),
    ),
  };
}
