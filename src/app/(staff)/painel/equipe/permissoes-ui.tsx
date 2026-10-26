"use client";

import { Check, Minus, Plus } from "lucide-react";

import { GRUPOS_PERMISSOES, NOME_PERMISSAO, type Permissao } from "@/lib/auth/papeis";
import { cn } from "@/lib/utils";

const chip = "flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium";
const ligado = "border-[var(--cor-primaria)] bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)]";

// Permissões de uma função: liga e desliga cada uma (vai no formulário como "permissoes").
export function ChipsPermissoes({ marcadas, aoMudar }: { marcadas: Permissao[]; aoMudar: (p: Permissao[]) => void }) {
  return (
    <div className="flex flex-col gap-3">
      {GRUPOS_PERMISSOES.map((g) => (
        <div key={g.titulo} role="group" aria-label={g.titulo} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase">{g.titulo}</span>
          <div className="flex flex-wrap gap-2">
            {g.itens.map((p) => {
              const on = marcadas.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => aoMudar(on ? marcadas.filter((x) => x !== p) : [...marcadas, p])}
                  className={cn(chip, on ? ligado : "text-muted-foreground hover:bg-muted")}
                >
                  {on ? <Check className="size-4" aria-hidden /> : null}
                  {NOME_PERMISSAO[p]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {marcadas.map((p) => (
        <input key={p} type="hidden" name="permissoes" value={p} />
      ))}
    </div>
  );
}

// Ajuste de uma pessoa sobre a função: tocar numa permissão da função tira só dela; tocar numa que a
// função não tem dá só para ela. O que mudou fica marcado ("a mais" / "tirada").
export function AjustePermissoes({
  daFuncao,
  extras,
  removidas,
  aoMudar,
}: {
  daFuncao: Permissao[];
  extras: Permissao[];
  removidas: Permissao[];
  aoMudar: (extras: Permissao[], removidas: Permissao[]) => void;
}) {
  function alternar(p: Permissao) {
    if (daFuncao.includes(p)) {
      aoMudar(extras, removidas.includes(p) ? removidas.filter((x) => x !== p) : [...removidas, p]);
    } else {
      aoMudar(extras.includes(p) ? extras.filter((x) => x !== p) : [...extras, p], removidas);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {GRUPOS_PERMISSOES.map((g) => (
        <div key={g.titulo} role="group" aria-label={g.titulo} className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase">{g.titulo}</span>
          <div className="flex flex-wrap gap-2">
            {g.itens.map((p) => {
              const funcao = daFuncao.includes(p);
              const aMais = !funcao && extras.includes(p);
              const tirada = funcao && removidas.includes(p);
              const on = (funcao && !tirada) || aMais;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={on}
                  onClick={() => alternar(p)}
                  className={cn(
                    chip,
                    on ? ligado : "text-muted-foreground hover:bg-muted",
                    aMais && "ring-2 ring-[var(--cor-primaria)] ring-offset-2",
                    tirada && "border-dashed line-through",
                  )}
                >
                  {aMais ? <Plus className="size-4" aria-hidden /> : tirada ? <Minus className="size-4" aria-hidden /> : on ? <Check className="size-4" aria-hidden /> : null}
                  {NOME_PERMISSAO[p]}
                  {aMais ? <span className="sr-only"> (a mais, só desta pessoa)</span> : null}
                  {tirada ? <span className="sr-only"> (tirada desta pessoa)</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Plus className="size-3.5" aria-hidden /> só desta pessoa
        </span>
        <span className="flex items-center gap-1">
          <Minus className="size-3.5" aria-hidden /> tirada desta pessoa
        </span>
      </p>
      {extras.filter((p) => !daFuncao.includes(p)).map((p) => (
        <input key={`e-${p}`} type="hidden" name="extras" value={p} />
      ))}
      {removidas.filter((p) => daFuncao.includes(p)).map((p) => (
        <input key={`r-${p}`} type="hidden" name="removidas" value={p} />
      ))}
    </div>
  );
}
