"use server";

import { createHash, randomInt } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { falhouAntiRobo, MENSAGEM_ANTI_ROBO, passeAntiRobo } from "@/lib/anti-robo";
import { entrarPeloAparelho, esquecerCookieAparelho, lembrarAparelho } from "../aparelho";
import { chavesDoLogin, esperaDoLogin, registrarLogin, textoEspera } from "@/lib/auth/bloqueio";
import { caminhoInterno } from "@/lib/caminho-seguro";
import { enviarEmail } from "@/lib/email";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoEntrarAdmin = { erro?: string; email?: string; aviso?: string } | undefined;

const schema = z.object({
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  senha: z.string().min(1, "Informe a senha."),
  next: z.string().optional(),
});

function destinoAdmin(next: string | undefined) {
  const destino = caminhoInterno(next, "/admin");
  return destino.startsWith("/admin") ? destino : "/admin";
}

// Segunda etapa: código de 6 números por e-mail. O banco guarda só o hash (pela chave secreta: a
// sessão que tem só a senha não consegue ver nem criar o código) e confere na confirmação.
async function enviarCodigo(userId: string, email: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return "Configuração do servidor incompleta.";
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.rpc("admin_guardar_codigo", {
    p_user_id: userId,
    p_codigo_hash: createHash("sha256").update(codigo).digest("hex"),
  });
  if (error) return "Não foi possível gerar o código. Tente de novo.";

  const envio = await enviarEmail({
    para: email,
    assunto: `Código de acesso: ${codigo}`,
    texto: `Seu código para entrar no painel da plataforma uau foods é ${codigo}.\n\nVale por 10 minutos. Se não foi você, troque sua senha: alguém sabe a senha da sua conta.`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#2b1a12">
<p>Seu código para entrar no painel da plataforma <strong>uau foods</strong>:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${codigo}</p>
<p>Vale por 10 minutos.</p>
<p style="color:#7a5c4a;font-size:13px">Se não foi você, troque sua senha: alguém sabe a senha da sua conta.</p>
</div>`,
  });
  return envio.ok ? null : `${envio.motivo} Fale com o suporte técnico.`;
}

// Etapa 1: e-mail e senha. Só administradores passam: quem não é sai na hora (a sessão não fica
// aberta) e recebe a mesma mensagem de senha errada (não revela quem é admin).
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
  const { data: login, error } = await supabase.auth.signInWithPassword({
    email: dados.data.email,
    password: dados.data.senha,
    options: { captchaToken: passeAntiRobo(formData) },
  });
  if (falhouAntiRobo(error)) return { erro: MENSAGEM_ANTI_ROBO, email };
  const bloqueio = await registrarLogin(chaves, !error);
  if (bloqueio > 0) return { erro: textoEspera(bloqueio), email };
  const { data: admin } = error ? { data: false } : await supabase.rpc("admin_sou_admin");
  if (error || !admin || !login.user) {
    if (!error) await supabase.auth.signOut();
    return { erro: "E-mail ou senha incorretos.", email };
  }

  // Já confirmou o código nesta sessão (raro) ou este computador foi lembrado: entra sem código.
  const { data: verificada } = await supabase.rpc("admin_sessao_verificada");
  if (verificada || (await entrarPeloAparelho(supabase))) redirect(destinoAdmin(dados.data.next));

  const falhaEnvio = await enviarCodigo(login.user.id, dados.data.email);
  if (falhaEnvio) {
    await supabase.auth.signOut();
    return { erro: falhaEnvio, email };
  }
  // A página passa a mostrar a etapa do código (sessão de admin ainda não confirmada).
  redirect(`/admin/entrar${dados.data.next ? `?next=${encodeURIComponent(dados.data.next)}` : ""}`);
}

// Etapa 2: o código que chegou no e-mail.
export async function confirmarCodigoAdmin(_estado: EstadoEntrarAdmin, formData: FormData): Promise<EstadoEntrarAdmin> {
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "");
  const next = String(formData.get("next") ?? "") || undefined;
  if (codigo.length !== 6) return { erro: "O código tem 6 números." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_confirmar_codigo", { p_codigo: codigo });
  if (error) {
    if (error.code === "42501") redirect("/admin/entrar");
    return { erro: error.message || "Não foi possível conferir o código." };
  }
  if (!data) return { erro: "Código errado. Confira o e-mail e tente de novo." };
  if (formData.get("lembrar") === "on") {
    await lembrarAparelho(supabase);
  }
  redirect(destinoAdmin(next));
}

export async function reenviarCodigoAdmin(): Promise<EstadoEntrarAdmin> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!userId || !email) redirect("/admin/entrar");
  const { data: admin } = await supabase.rpc("admin_sou_admin");
  if (!admin) redirect("/admin/entrar");
  if (!consumirLimite(`admin:codigo:${userId}`, 3, 10 * 60_000)) {
    return { erro: "Muitos códigos pedidos. Aguarde alguns minutos." };
  }
  const falha = await enviarCodigo(userId, email);
  return falha ? { erro: falha } : { aviso: "Enviamos outro código." };
}

// Apaga todos os computadores lembrados da conta (ex.: usou um computador de outra pessoa).
export async function esquecerComputadores(): Promise<{ ok: boolean; mensagem: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_esquecer_aparelhos");
  if (error) return { ok: false, mensagem: "Não foi possível agora. Tente de novo." };
  await esquecerCookieAparelho();
  return { ok: true, mensagem: data ? `${data} ${data === 1 ? "computador esquecido" : "computadores esquecidos"}. Na próxima entrada, o código volta a ser pedido.` : "Nenhum computador lembrado." };
}

export async function sairAdmin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/entrar");
}
