import "server-only";

import { headers } from "next/headers";

// Limite de requisições em memória (janela deslizante). Suficiente para um único container;
// com várias instâncias, trocar por um armazenamento compartilhado (ex.: Redis).
const janelas = new Map<string, number[]>();
let ultimaLimpeza = Date.now();
// A limpeza vale para todas as chaves: usa a maior janela em uso (senão um limite de 10 min
// apagaria os registros de um limite de 1 h).
let maiorJanela = 0;

function limparAntigos(agora: number, janelaMs: number) {
  maiorJanela = Math.max(maiorJanela, janelaMs);
  if (agora - ultimaLimpeza < 60_000) return;
  ultimaLimpeza = agora;
  for (const [chave, tempos] of janelas) {
    const recentes = tempos.filter((t) => agora - t < maiorJanela);
    if (recentes.length === 0) janelas.delete(chave);
    else janelas.set(chave, recentes);
  }
}

// IP do cliente atrás do proxy reverso (Traefik/Nginx definem X-Forwarded-For e X-Real-IP).
// null quando o proxy não repassa o IP: quem chama decide (não juntar todo mundo num balde só).
export async function ipDoCliente(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

function recentesDe(chave: string, janelaMs: number, agora: number): number[] {
  limparAntigos(agora, janelaMs);
  return (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
}

// true = pode seguir; false = passou do limite. Conta a tentativa.
export function consumirLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const recentes = recentesDe(chave, janelaMs, agora);
  if (recentes.length >= maximo) {
    janelas.set(chave, recentes);
    return false;
  }
  recentes.push(agora);
  janelas.set(chave, recentes);
  return true;
}

// Só confere, sem contar: para limitar o que deu certo (ex.: pedidos criados), não as tentativas.
export function limiteAtingido(chave: string, maximo: number, janelaMs: number): boolean {
  return recentesDe(chave, janelaMs, Date.now()).length >= maximo;
}

export function registrarUso(chave: string) {
  const agora = Date.now();
  janelas.set(chave, [...(janelas.get(chave) ?? []), agora]);
}
