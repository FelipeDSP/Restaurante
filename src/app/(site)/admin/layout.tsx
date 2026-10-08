import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { sair } from "@/lib/auth/actions";
import { obterVinculos } from "@/lib/auth/dal";

import { exigirAdmin } from "./dados";

export const metadata: Metadata = { robots: { index: false } };

// Painel do dono da plataforma: só a marca uau foods (nunca aparece para os restaurantes).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { email } = await exigirAdmin();
  const temRestaurante = (await obterVinculos()).length > 0;
  return (
    <div className="flex min-h-full flex-1 flex-col bg-uau-creme">
      <header className="sticky top-0 z-20 border-b border-uau-borda bg-uau-papel/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/admin" className="flex items-center gap-3">
            <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} className="h-8 w-auto" priority />
            <span className="rounded-full bg-uau-marrom px-2.5 py-0.5 text-xs font-bold tracking-wide text-uau-creme uppercase">Admin</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-uau-marrom-claro sm:inline">{email}</span>
            {temRestaurante ? (
              <Link href="/inicio" className="flex min-h-11 items-center rounded-full px-3 font-bold hover:bg-uau-marrom/5">
                Meu restaurante
              </Link>
            ) : null}
            <form action={sair}>
              <button type="submit" className="min-h-11 rounded-full px-3 font-bold hover:bg-uau-marrom/5">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">{children}</div>
    </div>
  );
}
