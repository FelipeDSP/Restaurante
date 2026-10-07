import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Criar conta" };

// Provisório: o cadastro self-service é o próximo passo.
export default function Cadastro() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
      <Link href="/" aria-label="uau foods, página inicial">
        <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} className="h-10 w-auto" />
      </Link>
      <h1 className="text-3xl font-black">O cadastro abre em breve</h1>
      <p className="text-uau-marrom-claro">Estamos preparando o teste grátis. Volte em alguns dias.</p>
      <Link href="/" className="font-extrabold underline underline-offset-4">
        Voltar para o início
      </Link>
    </main>
  );
}
