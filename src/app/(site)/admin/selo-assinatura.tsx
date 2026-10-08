import { cn } from "@/lib/utils";

import { diasRestantes, NOME_STATUS, type StatusAssinatura } from "./assinatura";

const COR: Record<StatusAssinatura, string> = {
  teste: "bg-amber-100 text-amber-900",
  ativa: "bg-green-100 text-green-800",
  atrasada: "bg-red-100 text-red-800",
  cancelada: "bg-zinc-200 text-zinc-700",
  cortesia: "bg-sky-100 text-sky-800",
};

export function SeloAssinatura({ status, testeTerminaEm }: { status: StatusAssinatura | null; testeTerminaEm: string | null }) {
  if (!status) return <span className="text-sm text-muted-foreground">Sem assinatura</span>;
  const dias = status === "teste" ? diasRestantes(testeTerminaEm) : null;
  const vencido = dias !== null && dias <= 0;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", vencido ? "bg-red-100 text-red-800" : COR[status])}>
        {vencido ? "Teste vencido" : NOME_STATUS[status]}
      </span>
      {dias !== null && !vencido ? (
        <span className={cn("text-xs", dias <= 3 ? "font-bold text-red-700" : "text-muted-foreground")}>
          {dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}
        </span>
      ) : null}
    </span>
  );
}
