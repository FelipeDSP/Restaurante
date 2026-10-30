"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { chavesDoLogin, esperaDoLogin, registrarLogin, textoEspera } from "@/lib/auth/bloqueio";
import { caminhoInterno } from "@/lib/caminho-seguro";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createClient } from "@/lib/supabase/server";

export type EstadoEntrarAdmin = { erro?: string; email?: string } | undefined;

const schema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  senha: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

// Entrada do painel da plataforma. Só administradores passam: quem não é sai na hora (a sessão não
// fica aberta) e recebe a mesma mensagem de senha errada (não revela quem é admin).
export async function entrarAdmin(_estado: EstadoEntrarAdmin, formData: FormData): Promise<EstadoEntrarAdmin> {
  const email = String(formData.get("email") ?? "");
  const dados = schema.safeParse({ email, senha: formData.get("senha"), next: formData.get("next") || undefined });
  if (!dados.success) return { erro: dados.error.issues[0]?.message, email };

  // Mesmo bloqueio do login da equipe (por conta e IP, no banco) e, por cima, um limite por IP mais
  // apertado: é a porta para todos os restaurantes.
  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`admin:ip:${ip}`, 15, 15 * 60_000)) {
    return { erro: "Muitas tentativas. Aguarde alguns minutos e tente de novo.", email };
  }
  const chaves = await chavesDoLogin(dados.data.email);
  const espera = await esperaDoLogin(chaves);
  if (espera > 0) return { erro: textoEspera(espera), email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  const bloqueio = await registrarLogin(chaves, !error);
  if (bloqueio > 0) return { erro: textoEspera(bloqueio), email };
  const { data: admin } = error ? { data: false } : await supabase.rpc("admin_sou_admin");
  if (error || !admin) {
    if (!error) await supabase.auth.signOut();
    return { erro: "E-mail ou senha incorretos.", email };
  }

  const destino = caminhoInterno(dados.data.next, "/admin");
  redirect(destino.startsWith("/admin") ? destino : "/admin");
}

export async function sairAdmin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/entrar");
}
