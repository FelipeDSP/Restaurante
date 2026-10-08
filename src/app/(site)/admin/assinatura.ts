// Rótulos e datas do painel admin (servidor e navegador).

export type StatusAssinatura = "teste" | "ativa" | "atrasada" | "cancelada" | "cortesia";

export const NOME_STATUS: Record<StatusAssinatura, string> = {
  teste: "Teste grátis",
  ativa: "Pagante",
  atrasada: "Pagamento atrasado",
  cancelada: "Cancelada",
  cortesia: "Cortesia",
};

// Dias até o fim do teste (zero ou negativo = já venceu).
export function diasRestantes(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function dataBR(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}
