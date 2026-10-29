"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";

import { useAcao } from "@/components/staff/acoes-cliente";
import { useAvisoResultado, valorCampo } from "@/components/staff/formulario";
import { BotaoConfirmar } from "@/components/staff/botao-confirmar";

import { adicionarAdmin, removerAdmin } from "../../actions";

export function NovoAdmin() {
  const [estado, acao, enviando] = useActionState(adicionarAdmin, undefined);
  useAvisoResultado(estado);
  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-2 sm:flex-row">
      <input
        name="email"
        type="email"
        required
        placeholder="E-mail de quem já tem conta"
        defaultValue={estado?.ok ? "" : valorCampo(estado, "email", "")}
        aria-label="E-mail do novo administrador"
        className="h-11 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#f6f1ea]/60 px-4 outline-none focus:border-uau-laranja focus:ring-2 focus:ring-uau-laranja/30"
      />
      <button
        type="submit"
        disabled={enviando}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-uau-marrom px-5 text-sm font-bold text-uau-creme hover:opacity-90 disabled:opacity-60"
      >
        <UserPlus className="size-4" aria-hidden />
        Tornar administrador
      </button>
    </form>
  );
}

export function RemoverAdmin({ userId, email }: { userId: string; email: string }) {
  const { executar, pendente } = useAcao();
  return (
    <BotaoConfirmar
      rotulo={`Tirar o acesso de ${email}`}
      confirmar="Tirar acesso"
      icone={false}
      desabilitado={pendente}
      aoConfirmar={() => executar(() => removerAdmin(userId))}
      className="h-9 text-xs"
    >
      Tirar acesso
    </BotaoConfirmar>
  );
}
