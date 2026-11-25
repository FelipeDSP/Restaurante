"use client";

import { useCallback } from "react";

import { novoId } from "@/lib/id";
import { useRascunho } from "@/lib/rascunho";

// Chave de idempotência do envio (o carrinho do site e o pedido pela mesa guardam os itens
// em outro lugar, então a chave tem o slot dela). Em useRef a chave morria na recarga: o
// carrinho voltava, a chave não, e tocar em Enviar de novo depois de uma resposta perdida
// criava um segundo pedido — cliente cobrado em dobro e comida feita duas vezes.
type Envio = { conteudo: string; chave: string };
const SEM_ENVIO: Envio = { conteudo: "", chave: "" };

function normalizar(valor: unknown): Envio | null {
  if (!valor || typeof valor !== "object") return null;
  const e = valor as Partial<Envio>;
  if (typeof e.conteudo !== "string" || typeof e.chave !== "string" || !e.chave) return null;
  return { conteudo: e.conteudo, chave: e.chave };
}

/**
 * `chaveDe(conteudo)` devolve a chave daquele conteúdo, criando uma nova quando o conteúdo
 * muda, e grava no aparelho antes de a requisição sair. Reenviar o mesmo conteúdo cai na
 * idempotência do banco, que devolve o pedido já criado.
 *
 * `limpar()` só depois do sucesso confirmado: a chave guardada depois disso faria o banco
 * devolver o pedido antigo, e um pedido novo igual (a mesma bebida de novo) sumiria calado.
 */
export function useChaveDeEnvio(nome: string) {
  const [, definir, limpar] = useRascunho(`envio:${nome}`, SEM_ENVIO, normalizar, "local");

  const chaveDe = useCallback(
    (conteudo: string) => {
      let chave = "";
      definir((atual) => {
        chave = atual.conteudo === conteudo && atual.chave ? atual.chave : novoId();
        return { conteudo, chave };
      });
      return chave;
    },
    [definir],
  );

  return { chaveDe, limpar };
}
