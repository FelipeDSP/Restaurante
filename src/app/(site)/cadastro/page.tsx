import { Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { obterUsuario } from "@/lib/auth/dal";
import { DIAS_TESTE_GRATIS } from "@/lib/planos";

import { LinhasVelocidade, Ticket } from "../_componentes/marca";
import { sairParaCriarConta } from "./actions";
import { FormCadastro } from "./form-cadastro";

export const metadata: Metadata = {
  title: "Criar conta",
  description: `Teste a uau foods grátis por ${DIAS_TESTE_GRATIS} dias, sem cartão de crédito.`,
};

export default async function Cadastro() {
  // Já conectado: antes ia direto para "criar restaurante", e a pessoa acabava criando o
  // restaurante na conta que estava aberta (ex.: a do caixa). Agora mostra qual conta é.
  const usuario = await obterUsuario();

  return (
    <div className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" aria-label="uau foods, página inicial" className="w-fit">
          <Image src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} priority className="h-9 w-auto" />
        </Link>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-8 py-10">
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-3 text-sm font-extrabold tracking-[0.18em] text-uau-laranja-escuro uppercase">
              <LinhasVelocidade className="h-3 w-7" />
              {DIAS_TESTE_GRATIS} dias grátis
            </p>
            <h1 className="text-4xl leading-[1.05] font-black tracking-[-0.02em] text-balance sm:text-5xl">
              Seu restaurante no ar ainda hoje.
            </h1>
            <p className="text-lg text-uau-marrom-claro">Crie a conta e, no próximo passo, escolha o nome, o endereço e as cores.</p>
          </div>
          {usuario ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-uau-borda bg-uau-papel p-5">
              <p className="text-lg">
                Este navegador já está conectado como <strong className="break-all">{usuario.email ?? "outra conta"}</strong>.
              </p>
              <div className="flex flex-wrap gap-3">
                <form action={sairParaCriarConta}>
                  <button type="submit" className="min-h-12 rounded-full bg-uau-marrom px-6 font-extrabold text-uau-creme">
                    Sair e criar outra conta
                  </button>
                </form>
                <Link
                  href="/comecar"
                  className="flex min-h-12 items-center rounded-full border border-uau-borda px-6 font-extrabold hover:bg-uau-marrom/5"
                >
                  Usar esta conta
                </Link>
              </div>
            </div>
          ) : (
            <FormCadastro />
          )}
        </div>
      </main>

      <aside aria-hidden className="relative hidden overflow-hidden bg-uau-marrom lg:flex lg:items-center lg:justify-center">
        <LinhasVelocidade className="absolute top-[18%] left-10 h-14 w-24 opacity-90" animar />
        <div className="animar-ticket w-[min(380px,80%)] rotate-[-2deg]">
          <Ticket
            titulo="SEU TESTE GRÁTIS"
            subtitulo={`${DIAS_TESTE_GRATIS} dias · sem cartão de crédito`}
            linhas={[
              { qtd: "1x", nome: "App do garçom", valor: "0,00" },
              { qtd: "1x", nome: "Caixa com resumo", valor: "0,00" },
              { qtd: "1x", nome: "Delivery com a sua marca", obs: "sem comissão", valor: "0,00" },
              { qtd: "1x", nome: "Equipe e cardápio", valor: "0,00" },
            ]}
            total="R$ 0,00"
            rodape="obrigado pela preferência :)"
          />
        </div>
        <ul className="absolute bottom-10 left-10 flex flex-col gap-2 text-sm font-bold text-uau-creme/80">
          {["Sem cartão de crédito", "Tudo liberado no teste", "Seus dados ficam com você"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check className="size-4 text-uau-laranja" strokeWidth={3} />
              {t}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
