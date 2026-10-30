"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { confirmarCodigoAdmin, entrarAdmin, reenviarCodigoAdmin, sairAdmin } from "./actions";
import { AntiRobo } from "@/components/anti-robo";

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
      <AntiRobo rodada={estado} tema="dark" />
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

// Segunda etapa: código de 6 números que chegou no e-mail do admin.
export function FormCodigoAdmin({ email, next }: { email: string; next?: string }) {
  const [estado, acao, enviando] = useActionState(confirmarCodigoAdmin, undefined);
  const [reenvio, setReenvio] = useState<{ erro?: string; aviso?: string } | undefined>();
  const [reenviando, iniciar] = useTransition();
  const mensagem = estado?.erro ?? reenvio?.erro;

  return (
    <form action={acao} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <p className="text-sm text-uau-creme/80">
        Digite o código de 6 números enviado para <strong className="break-all text-uau-creme">{email}</strong>.
      </p>
      <input
        name="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        placeholder="000000"
        aria-label="Código"
        className={`${CAMPO} text-center text-2xl tracking-[0.4em] tabular-nums`}
      />
      {mensagem ? (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200">
          {mensagem}
        </p>
      ) : reenvio?.aviso ? (
        <p role="status" className="rounded-lg bg-green-500/15 px-3 py-2 text-sm text-green-200">
          {reenvio.aviso}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={enviando}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-uau-laranja text-base font-black text-uau-marrom transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <LockKeyhole className="size-4" aria-hidden />
        {enviando ? "Conferindo..." : "Confirmar"}
      </button>
      <div className="flex justify-between gap-3 text-sm">
        <button
          type="button"
          disabled={reenviando}
          onClick={() => iniciar(async () => setReenvio(await reenviarCodigoAdmin()))}
          className="text-uau-creme/60 underline underline-offset-4 hover:text-uau-creme disabled:opacity-50"
        >
          {reenviando ? "Enviando..." : "Enviar outro código"}
        </button>
        <button type="button" onClick={() => void sairAdmin()} className="text-uau-creme/60 underline underline-offset-4 hover:text-uau-creme">
          Usar outra conta
        </button>
      </div>
    </form>
  );
}
