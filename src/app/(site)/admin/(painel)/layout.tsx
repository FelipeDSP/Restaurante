import type { Metadata } from "next";
import { LogOut, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { obterVinculos } from "@/lib/auth/dal";

import { exigirAdmin } from "../dados";
import { sairAdmin } from "../entrar/actions";
import { NavegacaoAdmin } from "./navegacao-admin";

export const metadata: Metadata = { robots: { index: false } };

function Marca() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5">
      <Image src="/marca/uau-foods-branca.png" alt="uau foods" width={1024} height={351} className="h-7 w-auto" priority />
      <span className="rounded-md bg-uau-laranja px-1.5 py-0.5 text-[10px] font-black tracking-[0.15em] text-uau-marrom uppercase">
        Admin
      </span>
    </Link>
  );
}

// Painel do dono da plataforma: só a marca uau foods (nunca aparece para os restaurantes).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await exigirAdmin();
  const temRestaurante = (await obterVinculos()).length > 0;

  const rodape = (
    <div className="flex flex-col gap-1 border-t border-white/10 pt-4">
      <p className="truncate px-3 pb-2 text-xs text-uau-creme/50" title={email}>
        {email}
      </p>
      {temRestaurante ? (
        <Link href="/inicio" className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-bold text-uau-creme/75 hover:bg-white/5 hover:text-uau-creme">
          <Store className="size-[18px]" aria-hidden />
          Meu restaurante
        </Link>
      ) : null}
      <form action={sairAdmin}>
        <button
          type="submit"
          className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-uau-creme/75 hover:bg-white/5 hover:text-uau-creme"
        >
          <LogOut className="size-[18px]" aria-hidden />
          Sair
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-1 bg-[#f6f1ea]">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 bg-uau-marrom p-5 lg:flex">
        <Marca />
        <div className="flex-1">
          <NavegacaoAdmin variante="lateral" />
        </div>
        {rodape}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-uau-marrom px-4 lg:hidden">
          <Marca />
          <NavegacaoAdmin variante="celular">{rodape}</NavegacaoAdmin>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
