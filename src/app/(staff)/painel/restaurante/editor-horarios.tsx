"use client";

import { Copy, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIAS, type Horarios, type Intervalo, NOME_DIA } from "@/lib/horarios";

// Edita os horários por dia e envia como JSON num campo escondido "horarios".
export function EditorHorarios({ inicial }: { inicial: Horarios }) {
  const [horarios, setHorarios] = useState<Horarios>(inicial);

  function alterar(dia: (typeof DIAS)[number], intervalos: Intervalo[]) {
    setHorarios((atual) => {
      const proximo = { ...atual };
      if (intervalos.length === 0) delete proximo[dia];
      else proximo[dia] = intervalos;
      return proximo;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="horarios" value={JSON.stringify(horarios)} />
      {DIAS.map((dia) => {
        const intervalos = horarios[dia] ?? [];
        const aberto = intervalos.length > 0;
        return (
          <div key={dia} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
            <label className="flex w-32 shrink-0 items-center gap-2 pt-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-5 accent-[var(--cor-primaria)]"
                checked={aberto}
                onChange={(e) => alterar(dia, e.target.checked ? [{ abre: "18:00", fecha: "23:00" }] : [])}
              />
              {NOME_DIA[dia]}
            </label>
            {aberto ? (
              <div className="flex flex-1 flex-col gap-2">
                {intervalos.map((intervalo, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      aria-label={`${NOME_DIA[dia]}: abre`}
                      value={intervalo.abre}
                      onChange={(e) =>
                        alterar(dia, intervalos.map((x, j) => (j === i ? { ...x, abre: e.target.value } : x)))
                      }
                      className="h-10 w-32"
                    />
                    <span className="text-sm text-muted-foreground">até</span>
                    <Input
                      type="time"
                      aria-label={`${NOME_DIA[dia]}: fecha`}
                      value={intervalo.fecha}
                      onChange={(e) =>
                        alterar(dia, intervalos.map((x, j) => (j === i ? { ...x, fecha: e.target.value } : x)))
                      }
                      className="h-10 w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remover intervalo"
                      onClick={() => alterar(dia, intervalos.filter((_, j) => j !== i))}
                    >
                      <X />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-1">
                  {intervalos.length < 3 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => alterar(dia, [...intervalos, { abre: "11:00", fecha: "14:00" }])}
                    >
                      <Plus />
                      Adicionar intervalo
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHorarios(Object.fromEntries(DIAS.map((d) => [d, intervalos.map((x) => ({ ...x }))])))}
                  >
                    <Copy />
                    Copiar para todos os dias
                  </Button>
                </div>
              </div>
            ) : (
              <span className="pt-2 text-sm text-muted-foreground">Fechado</span>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Se o horário de fechamento for menor que o de abertura (ex.: 18:00 até 02:00), conta como
        fechando depois da meia-noite.
      </p>
    </div>
  );
}
