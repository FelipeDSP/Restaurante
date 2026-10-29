"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { entrarAdmin } from "./actions";

const CAMPO =
  "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base text-uau-creme placeholder:text-uau-creme/40 outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30";

export function FormEntrarAdmin({ next }: { next?: string }) {
  const [estado, acao, enviando] = useActionState(entrarAdmin, undefined);

  return (
    <form action={acao} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-2 text-sm font-bold">
        E-mail
        <input
          key={estado?.email ?? ""}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          defaultValue={estado?.email}
          className={CAMPO}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-bold">
        Senha
        <input name="senha" type="password" autoComplete="current-password" required className={CAMPO} />
      </label>
      {estado?.erro ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {estado.erro}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={enviando}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-uau-laranja text-base font-black text-uau-marrom transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <LockKeyhole className="size-4" aria-hidden />
        {enviando ? "Entrando..." : "Entrar no painel"}
      </button>
      <Link href="/recuperar-senha" className="text-center text-sm text-uau-creme/60 underline underline-offset-4 hover:text-uau-creme">
        Esqueci minha senha
      </Link>
    </form>
  );
}
