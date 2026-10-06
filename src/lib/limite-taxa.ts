import "server-only";

import { headers } from "next/headers";

// Limite de requisições em memória (janela deslizante). Suficiente para um único container;
// com várias instâncias, trocar por um armazenamento compartilhado (ex.: Redis).
const janelas = new Map<string, number[]>();
let ultimaLimpeza = Date.now();

function limparAntigos(agora: number, janelaMs: number) {
  if (agora - ultimaLimpeza < 60_000) return;
  ultimaLimpeza = agora;
  for (const [chave, tempos] of janelas) {
    const recentes = tempos.filter((t) => agora - t < janelaMs);
    if (recentes.length === 0) janelas.delete(chave);
    else janelas.set(chave, recentes);
  }
}

// IP do cliente atrás do proxy reverso (Traefik/Nginx definem X-Forwarded-For).
export async function ipDoCliente(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

// true = pode seguir; false = passou do limite.
export function consumirLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  limparAntigos(agora, janelaMs);
  const recentes = (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= maximo) {
    janelas.set(chave, recentes);
    return false;
  }
  recentes.push(agora);
  janelas.set(chave, recentes);
  return true;
}
