"use client";

import { Eye, EyeOff, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { valorCampo } from "@/components/staff/formulario";

import { AvisoErro, BotaoEnviarUau, CampoUau, classeEntrada, propsErro } from "../_componentes/campos";
import { criarConta } from "./actions";

export function FormCadastro() {
  const [estado, acao] = useActionState(criarConta, undefined);
  const [verSenha, setVerSenha] = useState(false);

  if (estado?.emailEnviado) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-3xl border-2 border-uau-borda bg-uau-papel p-7">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-uau-laranja text-uau-marrom">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h2 className="text-2xl font-black">Confira seu e-mail</h2>
        <p className="text-uau-marrom-claro">
          Enviamos um link para <strong className="text-uau-marrom">{estado.emailEnviado}</strong>. Clique nele para
          confirmar a conta e cadastrar o seu restaurante.
        </p>
        <p className="text-sm text-uau-marrom-claro">Não chegou? Olhe a caixa de spam ou promoções.</p>
      </div>
    );
  }

  return (
    <form key={estado?.chave} action={acao} className="flex flex-col gap-5" noValidate>
      <AvisoErro estado={estado} />
      <div className="grid gap-5 sm:grid-cols-2">
        <CampoUau id="nome" rotulo="Seu nome" estado={estado}>
          <input
            id="nome"
            name="nome"
            autoComplete="name"
            required
            maxLength={80}
            defaultValue={valorCampo(estado, "nome", "")}
            className={classeEntrada}
            {...propsErro(estado, "nome")}
          />
        </CampoUau>
        <CampoUau id="restaurante" rotulo="Nome do restaurante" estado={estado}>
          <input
            id="restaurante"
            name="restaurante"
            autoComplete="organization"
            required
            maxLength={120}
            placeholder="Ex.: Brasa do Bairro"
            defaultValue={valorCampo(estado, "restaurante", "")}
            className={classeEntrada}
            {...propsErro(estado, "restaurante")}
          />
        </CampoUau>
      </div>
      <CampoUau id="email" rotulo="E-mail" estado={estado}>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          defaultValue={valorCampo(estado, "email", "")}
          className={classeEntrada}
          {...propsErro(estado, "email")}
        />
      </CampoUau>
      <CampoUau id="senha" rotulo="Crie uma senha" dica="Pelo menos 8 caracteres." estado={estado}>
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={verSenha ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            className={`${classeEntrada} pr-14`}
            {...propsErro(estado, "senha")}
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
            aria-pressed={verSenha}
            className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-uau-marrom-claro hover:bg-uau-marrom/5 hover:text-uau-marrom"
          >
            {verSenha ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </CampoUau>
      <BotaoEnviarUau pendente="Criando conta..." className="mt-1 w-full">
        Criar conta grátis
      </BotaoEnviarUau>
      <p className="text-center text-sm font-semibold text-uau-marrom-claro">
        Já tem conta?{" "}
        <Link href="/login" className="font-extrabold text-uau-marrom underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </form>
  );
}
