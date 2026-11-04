"use server";

import { z } from "zod";

import { chavesDoLogin, esperaDoLogin, registrarLogin, textoEspera } from "@/lib/auth/bloqueio";
import { enviarEmail } from "@/lib/email";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { telefoneComPais } from "@/lib/telefone";
import { origemDoSite } from "@/lib/url";
import { id } from "@/lib/validacao";

import { usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";

// Conta do cliente do delivery: cadastro normal (nome, e-mail, celular e senha), sem captcha
// (decisão do cliente em 04/11). O Supabase cobra o captcha em todo login pela chave pública, então
// o servidor cria a conta e confere a senha com a chave secreta e só depois passa a sessão ao
// navegador. A proteção contra robô aqui é o bloqueio por senha errada (por conta e IP) e limites.

export type ResultadoEntrar =
  | { ok: true; precisaNome?: boolean; nomeSugerido?: string }
  | { ok: false; mensagem: string };

const DEZ_MINUTOS = 10 * 60_000;
const MENSAGEM_EQUIPE = "Este e-mail é de uma conta da equipe de um restaurante. Para pedir, use outro e-mail.";
const SEM_CHAVE = "Não foi possível entrar agora. Tente de novo em instantes.";

const emailSchema = z.email("Informe um e-mail válido.").trim().toLowerCase();
const nomeSchema = z.string().trim().min(2, "Informe o seu nome.").max(120, "Nome muito longo.");
const senhaSchema = z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72, "Senha muito longa.");

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function ehDaEquipe(admin: Admin, userId: string): Promise<boolean> {
  const { count } = await admin.from("membros").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("ativo", true);
  return Boolean(count);
}

// Confere e-mail e senha pela chave secreta (sem captcha) e grava a sessão nos cookies do navegador.
async function abrirSessao(email: string, senha: string): Promise<{ ok: true; userId: string } | { ok: false; mensagem: string }> {
  const conferencia = createAdminClient();
  const admin = createAdminClient();
  if (!conferencia || !admin) return { ok: false, mensagem: SEM_CHAVE };

  const chaves = await chavesDoLogin(email);
  const espera = await esperaDoLogin(chaves);
  if (espera > 0) return { ok: false, mensagem: textoEspera(espera) };

  const { data, error } = await conferencia.auth.signInWithPassword({ email, password: senha });
  const bloqueio = await registrarLogin(chaves, !error);
  if (bloqueio > 0) return { ok: false, mensagem: textoEspera(bloqueio) };
  if (error || !data.session) return { ok: false, mensagem: "E-mail ou senha incorretos." };

  if (await ehDaEquipe(admin, data.session.user.id)) {
    await conferencia.auth.signOut({ scope: "local" });
    return { ok: false, mensagem: MENSAGEM_EQUIPE };
  }
  const supabase = await createClient();
  const { error: erroSessao } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (erroSessao) return { ok: false, mensagem: SEM_CHAVE };
  return { ok: true, userId: data.session.user.id };
}

// Criar conta: nome, e-mail, celular e senha. Já fica cadastrado neste restaurante.
export async function cadastrarCliente(
  slug: string,
  dados: { nome: string; email: string; celular: string; senha: string },
): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const v = z
    .object({ nome: nomeSchema, email: emailSchema, senha: senhaSchema })
    .safeParse({ nome: dados.nome, email: dados.email, senha: dados.senha });
  if (!v.success) return { ok: false, mensagem: v.error.issues[0].message };
  const celular = telefoneComPais(String(dados.celular ?? ""));
  if (!celular) return { ok: false, mensagem: "Informe o seu celular com DDD." };

  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`cadastro-cliente:ip:${ip}`, 5, DEZ_MINUTOS)) {
    return { ok: false, mensagem: "Muitos cadastros seguidos. Aguarde alguns minutos e tente de novo." };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, mensagem: SEM_CHAVE };

  const { error } = await admin.auth.admin.createUser({
    email: v.data.email,
    password: v.data.senha,
    email_confirm: true,
    user_metadata: { nome: v.data.nome },
  });
  if (error) {
    if (error.code === "email_exists") return { ok: false, mensagem: "Já existe uma conta com este e-mail. Entre com a sua senha." };
    if (error.code === "weak_password") return { ok: false, mensagem: "Senha fraca: misture letras e números." };
    console.error("[cadastro cliente]", error.code, error.message);
    return { ok: false, mensagem: "Não foi possível criar a conta agora. Tente de novo." };
  }

  const sessao = await abrirSessao(v.data.email, v.data.senha);
  if (!sessao.ok) return sessao;
  const supabase = await createClient();
  const { error: erroCadastro } = await supabase.rpc("entrar_como_cliente", {
    p_restaurante_id: restaurante.id,
    p_nome: v.data.nome,
    p_telefone: celular,
  });
  if (erroCadastro) return { ok: false, mensagem: erroCadastro.code === "P0001" ? erroCadastro.message : "Não foi possível salvar. Tente de novo." };
  return { ok: true };
}

// Entrar com e-mail e senha. Conta de outro restaurante: pede nome e celular para este.
export async function entrarCliente(slug: string, emailDigitado: string, senha: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const email = emailSchema.safeParse(emailDigitado);
  if (!email.success) return { ok: false, mensagem: email.error.issues[0].message };
  if (!senha) return { ok: false, mensagem: "Informe a senha." };

  const ip = await ipDoCliente();
  if (ip && !consumirLimite(`entrar-cliente:ip:${ip}`, 20, DEZ_MINUTOS)) {
    return { ok: false, mensagem: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }
  const sessao = await abrirSessao(email.data, senha);
  if (!sessao.ok) return sessao;

  const supabase = await createClient();
  const { data: cadastros } = await supabase.from("clientes").select("restaurante_id, nome").eq("user_id", sessao.userId);
  if (cadastros?.some((c) => c.restaurante_id === restaurante.id)) return { ok: true };
  return { ok: true, precisaNome: true, nomeSugerido: cadastros?.[0]?.nome };
}

// "Esqueci minha senha": link por e-mail (gerado pelo servidor, sem captcha) para /<slug>/nova-senha.
// Responde igual exista ou não a conta (não revela quem tem cadastro).
export async function esqueciSenhaCliente(slug: string, emailDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const email = emailSchema.safeParse(emailDigitado);
  if (!email.success) return { ok: false, mensagem: email.error.issues[0].message };

  const ip = await ipDoCliente();
  if (!consumirLimite(`senha-cliente:${email.data}`, 3, DEZ_MINUTOS) || (ip && !consumirLimite(`senha-cliente:ip:${ip}`, 10, DEZ_MINUTOS))) {
    return { ok: false, mensagem: "Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo." };
  }
  const admin = createAdminClient();
  if (!admin) return { ok: false, mensagem: SEM_CHAVE };

  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: email.data });
  if (error || !data.properties?.hashed_token || (await ehDaEquipe(admin, data.user.id))) return { ok: true };

  const origem = await origemDoSite();
  const link = `${origem}/auth/confirmar?token_hash=${data.properties.hashed_token}&type=recovery&next=${encodeURIComponent(`/${restaurante.slug}/nova-senha`)}`;
  const envio = await enviarEmail({
    para: email.data,
    assunto: `Nova senha · ${restaurante.nome}`,
    texto: `Para escolher uma senha nova da sua conta no ${restaurante.nome}, abra o link (vale por 1 hora):\n\n${link}\n\nNão foi você que pediu? Ignore este e-mail: sua senha continua a mesma.`,
    html: emailNovaSenha(restaurante.nome, link),
  });
  if (!envio.ok) {
    console.error("[esqueci senha cliente]", envio.motivo);
    return { ok: false, mensagem: "Não foi possível enviar o e-mail agora. Tente de novo." };
  }
  return { ok: true };
}

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

// E-mail neutro (cliente do restaurante: sem a marca da plataforma).
function emailNovaSenha(restaurante: string, link: string) {
  const nome = escapar(restaurante);
  const url = escapar(link);
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<tr><td style="padding:30px 28px 26px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">Escolha uma senha nova</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#3f3f46">Recebemos um pedido para trocar a senha da sua conta no <strong>${nome}</strong>.</p>
<p style="margin:0 0 20px"><a href="${url}" style="display:inline-block;padding:14px 26px;background:#18181b;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:12px">Escolher senha nova</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#52525b">O link vale por 1 hora. <strong>Não foi você?</strong> Ignore este e-mail: sua senha continua a mesma.</p>
</td></tr></table>
<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#71717a">Este é um e-mail automático, não precisa responder.</p>
</td></tr></table></body></html>`;
}

// Depois do link do e-mail: grava a senha nova (a sessão veio do link).
export async function definirSenhaCliente(slug: string, senha: string, confirmacao: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const v = senhaSchema.safeParse(senha);
  if (!v.success) return { ok: false, mensagem: v.error.issues[0].message };
  if (senha !== confirmacao) return { ok: false, mensagem: "As senhas não são iguais." };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "O link expirou. Peça outro em “Esqueci minha senha”." };
  const { error } = await usuario.supabase.auth.updateUser({ password: v.data });
  if (error) {
    return { ok: false, mensagem: error.code === "same_password" ? "Use uma senha diferente da anterior." : "Não foi possível trocar a senha. Tente de novo." };
  }
  return { ok: true };
}

// Primeira vez neste restaurante (a conta já existia em outro): nome e celular.
export async function concluirCadastro(slug: string, nomeDigitado: string, telefoneDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const nome = nomeSchema.safeParse(nomeDigitado);
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre de novo para continuar." };
  const telefone = telefoneComPais(String(telefoneDigitado ?? ""));
  if (!usuario.telefoneConfirmado && !telefone) return { ok: false, mensagem: "Informe o seu celular com DDD." };

  const { error } = await usuario.supabase.rpc("entrar_como_cliente", {
    p_restaurante_id: restaurante.id,
    p_nome: nome.data,
    p_telefone: telefone ?? undefined,
  });
  if (error) return { ok: false, mensagem: error.code === "P0001" ? error.message : "Não foi possível salvar. Tente de novo." };
  return { ok: true };
}

// "Minha conta": nome e celular (o confirmado pelo SMS não muda por aqui; o banco garante).
export async function salvarCadastro(slug: string, nomeDigitado: string, telefoneDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const nome = nomeSchema.safeParse(nomeDigitado);
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre de novo para continuar." };
  const { error } = await usuario.supabase.rpc("atualizar_meu_cadastro_cliente", {
    p_restaurante_id: restaurante.id,
    p_nome: nome.data,
    p_telefone: String(telefoneDigitado ?? ""),
  });
  if (error) return { ok: false, mensagem: error.code === "P0001" ? error.message : "Não foi possível salvar. Tente de novo." };
  return { ok: true };
}

export async function removerEndereco(slug: string, enderecoId: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante || !id.safeParse(enderecoId).success) return { ok: false, mensagem: "Endereço não encontrado." };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre de novo para continuar." };
  const { error } = await usuario.supabase
    .from("clientes_enderecos")
    .delete()
    .eq("restaurante_id", restaurante.id)
    .eq("id", enderecoId);
  if (error) return { ok: false, mensagem: "Não foi possível remover. Tente de novo." };
  return { ok: true };
}

export async function sair(): Promise<ResultadoEntrar> {
  const usuario = await usuarioCliente();
  if (usuario) await usuario.supabase.auth.signOut({ scope: "local" });
  return { ok: true };
}

// LGPD: apaga o cadastro e os endereços neste restaurante (os pedidos ficam, sem vínculo).
// Se a pessoa não for cliente de nenhum outro restaurante nem da equipe, apaga também o login.
export async function excluirConta(slug: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre de novo para continuar." };

  const { error } = await usuario.supabase
    .from("clientes")
    .delete()
    .eq("restaurante_id", restaurante.id)
    .eq("user_id", usuario.userId);
  if (error) return { ok: false, mensagem: "Não foi possível excluir. Tente de novo." };

  const [{ count: outrosCadastros }, { count: vinculosEquipe }] = await Promise.all([
    usuario.supabase.from("clientes").select("id", { count: "exact", head: true }).eq("user_id", usuario.userId),
    usuario.supabase.from("membros").select("id", { count: "exact", head: true }).eq("user_id", usuario.userId),
  ]);
  await usuario.supabase.auth.signOut({ scope: "global" });
  if (!outrosCadastros && !vinculosEquipe) {
    // A própria pessoa pediu, com a sessão dela, e só a conta dela é apagada.
    const admin = createAdminClient();
    const { error: erroLogin } = admin ? await admin.auth.admin.deleteUser(usuario.userId) : { error: new Error("sem chave secreta") };
    if (erroLogin) console.error("[excluir conta] login não apagado:", usuario.userId, erroLogin.message);
  }
  return { ok: true };
}
