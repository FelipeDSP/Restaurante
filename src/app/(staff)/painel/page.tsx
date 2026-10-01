import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirAcesso } from "@/lib/auth/dal";
import { NOME_PAPEL } from "@/lib/auth/papeis";

import { NAVEGACAO } from "./navegacao";

export default async function PainelPage() {
  const acesso = await exigirAcesso("painel");
  const atalhos = NAVEGACAO.filter((item) => item.descricao && item.papeis.includes(acesso.papel));

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {acesso.nome}</h1>
        <p className="text-muted-foreground">
          {acesso.restaurante.nome} · {NOME_PAPEL[acesso.papel]}
        </p>
      </div>
      {atalhos.length > 0 ? (
        <section aria-labelledby="titulo-cadastros" className="flex flex-col gap-3">
          <h2 id="titulo-cadastros" className="text-lg font-semibold">
            Cadastros
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {atalhos.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Card className="h-full transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle>{item.rotulo}</CardTitle>
                      <CardDescription>{item.descricao}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
