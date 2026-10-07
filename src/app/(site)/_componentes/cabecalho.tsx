import Image from "next/image";
import Link from "next/link";

import { BotaoPrincipal } from "./marca";

const LINKS = [
  { href: "#funcionalidades", rotulo: "Funcionalidades" },
  { href: "#como-funciona", rotulo: "Como funciona" },
  { href: "#planos", rotulo: "Planos" },
  { href: "#duvidas", rotulo: "Dúvidas" },
];

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30 border-b border-uau-borda/70 bg-uau-creme/85 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" aria-label="uau foods, página inicial" className="shrink-0">
          <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} priority className="h-9 w-auto" />
        </Link>
        <nav aria-label="Seções" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 text-[15px] font-bold text-uau-marrom-claro transition-colors hover:bg-uau-marrom/5 hover:text-uau-marrom"
            >
              {l.rotulo}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-4 py-2 text-[15px] font-bold text-uau-marrom-claro hover:bg-uau-marrom/5 hover:text-uau-marrom"
          >
            Entrar
          </Link>
          <BotaoPrincipal href="/cadastro" className="h-11 px-5 text-[15px]">
            Testar grátis
          </BotaoPrincipal>
        </div>
      </div>
    </header>
  );
}
