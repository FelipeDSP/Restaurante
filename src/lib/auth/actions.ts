"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { gravarRestauranteAtivo } from "@/lib/auth/cookie-restaurante";
import { COOKIE_RESTAURANTE, obterVinculos } from "@/lib/auth/dal";
import { rotaInicial } from "@/lib/auth/papeis";
import { createClient } from "@/lib/supabase/server";

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
