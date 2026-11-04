import { UserRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Conta é opcional: convite para entrar ou criar conta.
export function ConviteEntrar({ slug, voltar }: { slug: string; voltar: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserRound className="size-4" aria-hidden />
        Entre ou crie sua conta
      </h2>
      <p className="text-sm text-muted-foreground">
        Veja seus pedidos em qualquer aparelho e peça sem digitar o endereço de novo. É opcional.
      </p>
      <Button
        className="h-11 w-fit bg-[var(--cor-primaria)] text-[var(--cor-primaria-contraste)] hover:bg-[var(--cor-primaria)]/90"
        nativeButton={false}
        render={<Link href={`/${slug}/entrar?voltar=${voltar}`} />}
      >
        Entrar
      </Button>
    </section>
  );
}
