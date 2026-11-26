import Link from "next/link";

import { Painel } from "@/components/staff/graficos";
import { cn } from "@/lib/utils";

import type { ItemBaixo } from "./pendencias";

// Quanto falta, no jeito que o estoque guarda (3 un, 1,5 kg): o saldo é decimal e só mostra a
// vírgula quando existe.
const quantidade = (valor: number, unidade: string) =>
  `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`;

// Estoque no Início: só o que está acabando, com nome e saldo. A lista inteira fica em
// Configurações › Estoque — aqui é o aviso, não o controle.
export function EstoqueResumo({ itens }: { itens: ItemBaixo[] }) {
  if (itens.length === 0) return null;
  const mostrados = itens.slice(0, 6);

  return (
    <Painel
      titulo="Estoque acabando"
      className="border-amber-300 bg-amber-50"
      acao={
        <Link href="/painel/estoque" className="text-sm font-medium underline underline-offset-4">
          Estoque
        </Link>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {mostrados.map((item) => {
          const acabou = item.saldo <= 0;
          return (
            <li key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-white/70 p-2.5 text-sm">
              <span
                className={cn("size-2.5 shrink-0 rounded-full", acabou ? "bg-red-600" : "bg-amber-500")}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium">{item.nome}</span>
              <span className={cn("shrink-0 tabular-nums", acabou ? "font-semibold text-red-700" : "text-amber-900")}>
                {acabou ? (item.saldo < 0 ? quantidade(item.saldo, item.unidade) : "acabou") : quantidade(item.saldo, item.unidade)}
              </span>
            </li>
          );
        })}
      </ul>
      {itens.length > mostrados.length ? (
        <p className="text-sm text-amber-900/80">e mais {itens.length - mostrados.length}.</p>
      ) : null}
    </Painel>
  );
}
