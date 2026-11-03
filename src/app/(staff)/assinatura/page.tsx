import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MarcaRestaurante } from "@/components/staff/marca-restaurante";
import { Button } from "@/components/ui/button";
import { sair } from "@/lib/auth/actions";
import { destinoInicial, obterAcessoSuspenso } from "@/lib/auth/dal";
import { linkAjuda } from "@/lib/contato";
import { estiloMarca } from "@/lib/cores";

import { ConteudoAssinatura } from "../painel/assinatura/conteudo";

export const metadata: Metadata = { title: "Acesso suspenso" };

// Restaurante suspenso por falta de pagamento (5 dias depois do vencimento ou do fim do teste):
// o dono vê os planos e a fatura; o resto da equipe, só o aviso. Pagou, volta ao normal sozinho.
export default async function AcessoSuspensoPage() {
  const acesso = await obterAcessoSuspenso();
  if (!acesso) redirect(await destinoInicial());

  const rodape = (
    <div className="flex flex-wrap justify-center gap-2">
      {acesso.vinculos.length > 1 ? (
        <Button variant="outline" className="h-11" nativeButton={false} render={<Link href="/selecionar" />}>
          Trocar de restaurante
        </Button>
      ) : null}
      <form action={sair}>
        <Button type="submit" variant="outline" className="h-11">
          Sair
        </Button>
      </form>
    </div>
  );

  if (acesso.papel !== "dono") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-4 text-center">
        <h1 className="text-2xl font-semibold">Acesso suspenso</h1>
        <p className="text-muted-foreground">
          O sistema de {acesso.restaurante.nome} está suspenso por falta de pagamento. Avise o responsável.
        </p>
        {rodape}
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col" style={estiloMarca(acesso.restaurante)}>
      <header className="bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] shadow-sm">
        <div className="flex h-16 items-center px-4">
          <MarcaRestaurante restaurante={acesso.restaurante} />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
        <ConteudoAssinatura
          acesso={acesso}
          aviso={
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
              <p className="font-semibold">Acesso suspenso por falta de pagamento</p>
              <p className="text-sm">
                O painel e os pedidos pelo site ficam parados até o pagamento. Pagou, libera na hora (boleto pode levar até 3 dias
                úteis para ser confirmado).{" "}
                <a href={linkAjuda(acesso.restaurante)} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">
                  Falar com o suporte
                </a>
              </p>
            </div>
          }
        />
        {rodape}
      </div>
    </div>
  );
}
