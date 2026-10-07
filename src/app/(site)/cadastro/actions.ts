"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, falhaValidacao, type ResultadoAcao } from "@/lib/acoes";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";
import { dadosDoFormulario, textoObrigatorio } from "@/lib/validacao";

export type EstadoCadastro = (NonNullable<ResultadoAcao> & { emailEnviado?: string }) | undefined;

const schema = z.object({
  nome: textoObrigatorio("o seu nome", 80),
  restaurante: textoObrigatorio("o nome do restaurante", 120),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  senha: z.string().min(8, "Use pelo menos 8 caracteres.").max(72, "Máximo de 72 caracteres."),
});

// Cria a conta do dono. O restaurante é criado em /comecar, já logado
// (assim o fluxo funciona com ou sem confirmação de e-mail no Supabase).
export async function criarConta(_estado: EstadoCadastro, formData: FormData): Promise<EstadoCadastro> {
  const dados = schema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  if (!consumirLimite(`cadastro:${await ipDoCliente()}`, 5, 60 * 60 * 1000)) {
    return falha("Muitas contas criadas daqui em pouco tempo. Tente de novo mais tarde.", undefined, formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: {
      data: { nome: dados.data.nome, restaurante: dados.data.restaurante },
      emailRedirectTo: `${await origemDoSite()}/auth/confirmar?next=/comecar`,
    },
  });

  if (error) {
    switch (error.code) {
      case "user_already_exists":
      case "email_exists":
        return falha("Confira os campos destacados.", { email: "Esse e-mail já tem conta. Entre com ele." }, formData);
      case "weak_password":
        return falha("Confira os campos destacados.", { senha: "Senha fraca. Misture letras e números." }, formData);
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return falha("Muitas tentativas. Aguarde alguns minutos e tente de novo.", undefined, formData);
      case "signup_disabled":
        return falha("O cadastro está fechado no momento.", undefined, formData);
      default:
        return falha("Não foi possível criar a conta. Tente novamente.", undefined, formData);
    }
  }

  // Sem confirmação de e-mail: já está logado.
  if (data.session) redirect("/comecar");

  // Com confirmação: o link do e-mail leva a /auth/confirmar -> /comecar.
  // (Se o e-mail já existia, o Supabase responde igual, sem revelar a conta.)
  return { ok: true, chave: Date.now(), emailEnviado: dados.data.email };
}
