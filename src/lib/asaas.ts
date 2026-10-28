import "server-only";

import { timingSafeEqual } from "node:crypto";

// Cobrança da assinatura pelo Asaas (API v3). Tudo lido em tempo de execução, só no servidor:
//   ASAAS_API_KEY       chave da conta (sandbox: $aact_hmlg_...; produção: $aact_prod_...)
//   ASAAS_AMBIENTE      "sandbox" (padrão) ou "producao"
//   ASAAS_WEBHOOK_TOKEN o mesmo token cadastrado no webhook do Asaas (cabeçalho asaas-access-token)
// Sem a chave, a assinatura online fica "em breve" e nada é chamado.

const URL_API = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;

function config() {
  const chave = process.env.ASAAS_API_KEY?.trim();
  if (!chave) return null;
  const ambiente = process.env.ASAAS_AMBIENTE?.trim() === "producao" ? "producao" : "sandbox";
  return { chave, url: URL_API[ambiente], ambiente };
}

export function asaasConfigurado(): boolean {
  return config() !== null;
}

export class ErroAsaas extends Error {}

async function chamar<T>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const c = config();
  if (!c) throw new ErroAsaas("A cobrança online ainda não está ligada.");
  const resposta = await fetch(`${c.url}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      // O Asaas exige User-Agent; sem a marca da plataforma (white label não importa aqui, mas é neutro).
      "User-Agent": `Restaurante/1.0 (Node.js; ${c.ambiente})`,
      access_token: c.chave,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const dados = (await resposta.json().catch(() => null)) as { errors?: { description?: string }[] } | null;
  if (!resposta.ok) {
    const motivo = dados?.errors?.[0]?.description;
    console.error("[asaas]", metodo, caminho, resposta.status, motivo);
    throw new ErroAsaas(motivo ? `O Asaas recusou: ${motivo}` : "Não foi possível falar com o sistema de cobrança. Tente de novo.");
  }
  return dados as T;
}

export async function criarCliente(dados: { nome: string; cpfCnpj: string; email: string | null; restauranteId: string }) {
  return chamar<{ id: string }>("POST", "/customers", {
    name: dados.nome,
    cpfCnpj: dados.cpfCnpj,
    email: dados.email ?? undefined,
    externalReference: dados.restauranteId,
    notificationDisabled: false,
  });
}

// Mensal; o cliente escolhe Pix, boleto ou cartão na fatura (billingType UNDEFINED).
export async function criarAssinatura(dados: {
  clienteId: string;
  valorCentavos: number;
  primeiroVencimento: string; // AAAA-MM-DD
  descricao: string;
  restauranteId: string;
}) {
  return chamar<{ id: string }>("POST", "/subscriptions", {
    customer: dados.clienteId,
    billingType: "UNDEFINED",
    cycle: "MONTHLY",
    value: dados.valorCentavos / 100,
    nextDueDate: dados.primeiroVencimento,
    description: dados.descricao,
    externalReference: dados.restauranteId,
  });
}

// Troca de plano: muda o valor e a descrição, inclusive da fatura que ainda não foi paga.
export async function atualizarAssinatura(assinaturaId: string, dados: { valorCentavos: number; descricao: string }) {
  return chamar<{ id: string }>("PUT", `/subscriptions/${encodeURIComponent(assinaturaId)}`, {
    value: dados.valorCentavos / 100,
    description: dados.descricao,
    updatePendingPayments: true,
  });
}

// Link da fatura em aberto mais próxima (para o botão "Pagar").
export async function faturaEmAberto(assinaturaId: string): Promise<string | null> {
  const r = await chamar<{ data: { invoiceUrl: string; status: string; dueDate: string }[] }>(
    "GET",
    `/subscriptions/${encodeURIComponent(assinaturaId)}/payments`,
  );
  const abertas = (r.data ?? [])
    .filter((p) => p.status === "PENDING" || p.status === "OVERDUE")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return abertas[0]?.invoiceUrl ?? null;
}

// O aviso (webhook) veio mesmo do Asaas: token configurado lá, comparado sem vazar tempo.
export function tokenWebhookValido(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// CPF (11) ou CNPJ (14) com dígitos verificadores certos. Devolve só os números ou null.
export function cpfCnpjValido(texto: string): string | null {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 11 && d.length !== 14) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  const digito = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return digito(d, p1) === Number(d[9]) && digito(d, p2) === Number(d[10]) ? d : null;
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return digito(d, p1) === Number(d[12]) && digito(d, p2) === Number(d[13]) ? d : null;
}
