"use client";

import { Button } from "@/components/ui/button";
import { DIAS_SEMANA, TODOS_OS_DIAS } from "@/lib/cardapios";
import { cn } from "@/lib/utils";

// Dias da semana em botões, enviados como JSON no campo escondido "dias".
// `nome` null: quem chama monta o campo escondido (o produto manda "" para "todos os dias").
export function EscolherDias({
  dias,
  aoMudar,
  nome = "dias",
  mostrarTodos = true,
}: {
  dias: number[];
  aoMudar: (dias: number[]) => void;
  nome?: string | null;
  mostrarTodos?: boolean;
}) {
  const todos = dias.length === 7;
  return (
    <div className="flex flex-col gap-2">
      {nome ? <input type="hidden" name={nome} value={JSON.stringify(dias)} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {DIAS_SEMANA.map((dia) => {
          const marcado = dias.includes(dia.valor);
          return (
            <button
              key={dia.valor}
              type="button"
              aria-pressed={marcado}
              aria-label={dia.nome}
              onClick={() =>
                aoMudar(marcado ? dias.filter((d) => d !== dia.valor) : [...dias, dia.valor].sort((a, b) => a - b))
              }
              className={cn(
                "h-11 w-13 rounded-lg border text-sm font-medium transition-colors pointer-coarse:w-14",
                marcado
                  ? "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]"
                  : "hover:bg-muted",
              )}
            >
              {dia.abrev}
            </button>
          );
        })}
      </div>
      {mostrarTodos && !todos ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => aoMudar([...TODOS_OS_DIAS])}>
          Todos os dias
        </Button>
      ) : null}
    </div>
  );
}
