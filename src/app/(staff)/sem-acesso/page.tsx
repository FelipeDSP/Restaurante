import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { sair } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Sem acesso" };

export default function SemAcessoPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Sem acesso</h1>
      <p className="text-muted-foreground">
        Seu usuário não está vinculado a nenhum restaurante ativo. Peça ao responsável para
        adicionar você à equipe.
      </p>
      <form action={sair}>
        <Button type="submit" variant="outline" className="w-full">
          Sair
        </Button>
      </form>
    </main>
  );
}
