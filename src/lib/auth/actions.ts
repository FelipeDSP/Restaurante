"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { gravarRestauranteAtivo } from "@/lib/auth/cookie-restaurante";
import { COOKIE_RESTAURANTE, destinoInicial, obterVinculos } from "@/lib/auth/dal";
import { rotaInicial } from "@/lib/auth/papeis";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

export type EstadoLogin = { erro?: string; email?: string } | undefined;

const loginSchema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  senha: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

// Só aceita caminhos internos (evita redirecionar para outro site).
function caminhoSeguro(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/inicio";
  }
  return next;
}

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "");
  const dados = loginSchema.safeParse({
    email,
    senha: formData.get("senha"),
    next: formData.get("next") || undefined,
  });
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message, email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
  });
  if (error) {
    return { erro: "E-mail ou senha incorretos.", email };
  }

  redirect(caminhoSeguro(dados.data.next));
}

export async function sair(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_RESTAURANTE);
  redirect("/login");
}

// z.guid(): aceita qualquer uuid do Postgres (z.uuid() exige versão/variante RFC).
const escolhaSchema = z.object({ restauranteId: z.guid() });

export async function escolherRestaurante(formData: FormData): Promise<void> {
  const dados = escolhaSchema.safeParse({ restauranteId: formData.get("restauranteId") });
  if (!dados.success) redirect("/selecionar");

  // Valida contra os vínculos do usuário logado; nunca confia no valor enviado.
  const vinculo = (await obterVinculos()).find((v) => v.restaurante.id === dados.data.restauranteId);
  if (!vinculo) redirect("/selecionar");

  await gravarRestauranteAtivo(vinculo.restaurante.id);
  redirect(rotaInicial(vinculo.papel));
}

// ---------------------------------------------------------------------------
// Esqueci minha senha: e-mail com link -> /auth/confirmar (sessão de recuperação) -> /nova-senha
// ---------------------------------------------------------------------------

export type EstadoRecuperacao = { enviado?: boolean; erro?: string; email?: string } | undefined;

export async function pedirRecuperacao(_estado: EstadoRecuperacao, formData: FormData): Promise<EstadoRecuperacao> {
  const email = String(formData.get("email") ?? "");
  const dados = z.object({ email: z.email("Informe um e-mail válido.").trim().toLowerCase() }).safeParse({ email });
  if (!dados.success) return { erro: dados.error.issues[0]?.message, email };

  if (!consumirLimite(`recuperar:${(await ipDoCliente()) ?? "desconhecido"}`, 5, 60 * 60_000)) {
    return { erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", email };
  }

  const supabase = await createClient();
  // A resposta é a mesma exista ou não a conta (não revela quais e-mails estão cadastrados).
  await supabase.auth.resetPasswordForEmail(dados.data.email, {
    redirectTo: `${await origemDoSite()}/auth/confirmar?next=/nova-senha`,
  });
  return { enviado: true, email: dados.data.email };
}

export type EstadoNovaSenha = { erro?: string } | undefined;

export async function definirNovaSenha(_estado: EstadoNovaSenha, formData: FormData): Promise<EstadoNovaSenha> {
  const dados = z
    .object({
      senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72),
      confirmacao: z.string(),
    })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não são iguais.", path: ["confirmacao"] })
    .safeParse({ senha: formData.get("senha"), confirmacao: formData.get("confirmacao") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { erro: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) {
    return {
      erro: error.code === "same_password" ? "Use uma senha diferente da anterior." : "Não foi possível trocar a senha. Tente de novo.",
    };
  }
  redirect(await destinoInicial());
}
