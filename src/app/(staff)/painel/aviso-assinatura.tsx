import Link from "next/link";

import type { Assinatura } from "@/lib/assinatura";
import { cn } from "@/lib/utils";

// Faixa no topo do painel (só para o dono) durante o teste ou com pendência.
export function AvisoAssinatura({ assinatura }: { assinatura: Assinatura | null }) {
  if (!assinatura) return null;

  let texto: string;
  let urgente = false;
  switch (assinatura.situacao) {
    case "teste": {
      const dias = assinatura.diasRestantesTeste ?? 0;
      texto = dias <= 1 ? "Seu teste grátis termina hoje." : `Teste grátis: faltam ${dias} dias.`;
      urgente = dias <= 3;
      break;
    }
    case "teste_encerrado":
      texto = "Seu teste grátis terminou. Escolha um plano para continuar.";
      urgente = true;
      break;
    case "atrasada":
      texto = "O pagamento da assinatura está atrasado.";
      urgente = true;
      break;
    case "cancelada":
      texto = "Sua assinatura foi cancelada.";
      urgente = true;
      break;
    default:
      return null;
  }

  return (
    <div
      role="status"
      className={cn(
        "border-b px-4 py-2 text-center text-sm print:hidden",
        urgente ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950",
      )}
    >
      {texto}{" "}
      <Link href="/painel/assinatura" className="font-semibold underline underline-offset-4">
        Ver planos
      </Link>
    </div>
  );
}
