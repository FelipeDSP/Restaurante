"use client";

import { ArrowRight, Plus, Trash2 } from "lucide-react";

import { Selecao } from "@/components/staff/formulario";
import { Button } from "@/components/ui/button";

// Uma etapa da rota de preparo. `junto` = acontece ao mesmo tempo que a etapa anterior.
export type EtapaEditavel = { estacaoId: string; junto: boolean };

// Converte para o formato do banco: mesma ordem = ao mesmo tempo; ordem maior = depois.
export function etapasParaBanco(etapas: EtapaEditavel[]): { estacao_id: string; ordem: number }[] {
  let ordem = 0;
  return etapas
    .filter((e) => e.estacaoId)
    .map((e, i) => {
      if (i === 0 || !e.junto) ordem += 1;
      return { estacao_id: e.estacaoId, ordem };
    });
}

export function etapasDoBanco(etapas: { estacao_id: string; ordem: number }[]): EtapaEditavel[] {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  return ordenadas.map((e, i) => ({ estacaoId: e.estacao_id, junto: i > 0 && ordenadas[i - 1].ordem === e.ordem }));
}

// "Churrasqueira → Chapa", "Chapa + Fritadeira".
export function resumoRota(etapas: EtapaEditavel[], pracas: { id: string; nome: string }[]): string {
  const nome = (id: string) => pracas.find((p) => p.id === id)?.nome ?? "?";
  return etapas
    .filter((e) => e.estacaoId)
    .map((e, i) => (i === 0 ? nome(e.estacaoId) : `${e.junto ? " + " : " → "}${nome(e.estacaoId)}`))
    .join("");
}

export function EditorRota({
  pracas,
  etapas,
  aoMudar,
}: {
  pracas: { id: string; nome: string }[];
  etapas: EtapaEditavel[];
  aoMudar: (etapas: EtapaEditavel[]) => void;
}) {
  const usadas = new Set(etapas.map((e) => e.estacaoId));
  const livres = pracas.filter((p) => !usadas.has(p.id));

  function mudar(i: number, parcial: Partial<EtapaEditavel>) {
    aoMudar(etapas.map((e, j) => (j === i ? { ...e, ...parcial } : e)));
  }

  if (pracas.length === 0) {
    return <p className="text-sm text-muted-foreground">Cadastre as praças em Painel &gt; Praças para montar a rota de preparo.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {etapas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Não vai para a cozinha (ex.: bebidas). Adicione uma praça se precisar de preparo.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {etapas.map((etapa, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              {i === 0 ? (
                <span className="w-44 text-sm font-medium">Primeiro em</span>
              ) : (
                <Selecao
                  aria-label={`Quando a etapa ${i + 1} acontece`}
                  value={etapa.junto ? "junto" : "depois"}
                  onChange={(e) => mudar(i, { junto: e.target.value === "junto" })}
                  className="h-10 w-44"
                >
                  <option value="depois">Depois em</option>
                  <option value="junto">Ao mesmo tempo em</option>
                </Selecao>
              )}
              <Selecao
                aria-label={`Praça da etapa ${i + 1}`}
                value={etapa.estacaoId}
                onChange={(e) => mudar(i, { estacaoId: e.target.value })}
                className="h-10 min-w-40 flex-1"
              >
                {pracas
                  .filter((p) => p.id === etapa.estacaoId || !usadas.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
              </Selecao>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover a etapa ${i + 1}`}
                onClick={() => aoMudar(etapas.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {livres.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => aoMudar([...etapas, { estacaoId: livres[0].id, junto: false }])}
          >
            <Plus />
            {etapas.length === 0 ? "Adicionar praça" : "Adicionar outra praça"}
          </Button>
        ) : null}
        {etapas.length > 1 ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowRight className="size-4" aria-hidden />
            {resumoRota(etapas, pracas)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
