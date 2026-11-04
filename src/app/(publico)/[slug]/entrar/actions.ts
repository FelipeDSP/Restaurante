"use server";

import { z } from "zod";

import { falhouAntiRobo, MENSAGEM_ANTI_ROBO } from "@/lib/anti-robo";
import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { formasDeEntrar } from "@/lib/login-cliente";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { telefoneComPais } from "@/lib/telefone";
import { origemDoSite } from "@/lib/url";
import { id } from "@/lib/validacao";

import { usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";

export type ResultadoEntrar =
  | { ok: true; precisaNome?: boolean; precisaTelefone?: boolean; nomeSugerido?: string; url?: string }
  | { ok: false; mensagem: string };

const DEZ_MINUTOS = 10 * 60_000;
const MENSAGEM_EQUIPE = "Este navegador está conectado com uma conta da equipe. Saia dela para entrar como cliente.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// A sessão aberta neste navegador é de alguém da equipe? (o caixa não vira cliente sem querer)
async function sessaoDaEquipe(supabase: Supabase): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return false;
  const { count } = await supabase.from("membros").select("id", { count: "exact", head: true }).eq("user_id", sub).eq("ativo", true);
  return Boolean(count);
}

// Depois de entrar: já é cliente deste restaurante? Senão pede o nome (e o celular, sem SMS confirmado).
async function depoisDeEntrar(supabase: Supabase, restauranteId: string): Promise<ResultadoEntrar> {
  if (await sessaoDaEquipe(supabase)) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, mensagem: "Este e-mail é de uma conta da equipe de um restaurante. Para pedir, use outro e-mail." };
  }
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Não foi possível entrar. Tente de novo." };
  const { data: cadastros } = await supabase.from("clientes").select("restaurante_id, nome").eq("user_id", usuario.userId);
  if (cadastros?.some((c) => c.restaurante_id === restauranteId)) return { ok: true };
  return {
    ok: true,
    precisaNome: true,
    precisaTelefone: !usuario.telefoneConfirmado,
    nomeSugerido: cadastros?.[0]?.nome ?? usuario.nomeSugerido ?? undefined,
  };
}

const emailSchema = z.email("Informe um e-mail válido.").trim().toLowerCase();

// Código de 6 números por e-mail, sem senha. A conta é criada antes, já confirmada, para o e-mail sair
// sempre no modelo do código de acesso (o modelo de cadastro é o do dono de restaurante).
export async function pedirCodigoEmail(slug: string, emailDigitado: string, passe?: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const email = emailSchema.safeParse(emailDigitado);
  if (!email.success) return { ok: false, mensagem: email.error.issues[0].message };

  const supabase = await createClient();
  if (await sessaoDaEquipe(supabase)) return { ok: false, mensagem: MENSAGEM_EQUIPE };

  const ip = await ipDoCliente();
  if (!consumirLimite(`codigo:email:${email.data}`, 3, DEZ_MINUTOS) || (ip && !consumirLimite(`codigo:ip:${ip}`, 10, DEZ_MINUTOS))) {
    return { ok: false, mensagem: "Muitos códigos pedidos. Aguarde alguns minutos e tente de novo." };
  }

  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.auth.admin.createUser({ email: email.data, email_confirm: true });
    if (error && error.code !== "email_exists") console.error("[entrar] conta não criada:", error.code, error.message);
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: !admin, captchaToken: typeof passe === "string" && passe ? passe : undefined },
  });
  if (falhouAntiRobo(error)) return { ok: false, mensagem: MENSAGEM_ANTI_ROBO };
  if (error) {
    console.error("[entrar] código por e-mail não enviado:", error.code, error.message);
    if (error.status === 429) return { ok: false, mensagem: "Muitos códigos pedidos. Aguarde um pouco e tente de novo." };
    return { ok: false, mensagem: "Não foi possível enviar o código agora. Tente de novo ou peça sem entrar." };
  }
  return { ok: true };
}

export async function confirmarCodigoEmail(slug: string, emailDigitado: string, codigoDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const email = emailSchema.safeParse(emailDigitado);
  const codigo = String(codigoDigitado).replace(/\D/g, "");
  if (!email.success) return { ok: false, mensagem: "Informe um e-mail válido." };
  if (codigo.length !== 6) return { ok: false, mensagem: "O código tem 6 números." };
  if (!consumirLimite(`codigo:verificar:${email.data}`, 6, DEZ_MINUTOS)) {
    return { ok: false, mensagem: "Muitas tentativas. Peça um código novo daqui a alguns minutos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: email.data, token: codigo, type: "email" });
  if (error || !data.user) return { ok: false, mensagem: "Código errado ou vencido. Confira ou peça outro." };
  return depoisDeEntrar(supabase, restaurante.id);
}

// "Continuar com Google": devolve o endereço do Google. A volta passa por /auth/confirmar e cai de novo
// em /<slug>/entrar, que pede nome e celular se for a primeira vez neste restaurante.
export async function entrarComGoogle(slug: string, destino: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  if (!formasDeEntrar().google) return { ok: false, mensagem: "Entrar com o Google não está disponível agora." };
  const supabase = await createClient();
  if (await sessaoDaEquipe(supabase)) return { ok: false, mensagem: MENSAGEM_EQUIPE };

  const volta = destino.startsWith(`/${restaurante.slug}/`) && !destino.startsWith("//") ? destino : `/${restaurante.slug}/pedidos`;
  const depois = `/${restaurante.slug}/entrar?voltar=${encodeURIComponent(volta)}`;
  const origem = await origemDoSite();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origem}/auth/confirmar?next=${encodeURIComponent(depois)}`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("[entrar] Google:", error?.code, error?.message);
    return { ok: false, mensagem: "Não foi possível abrir o Google agora. Tente de novo ou entre com o e-mail." };
  }
  return { ok: true, url: data.url };
}

// Celular + código por SMS (só quando há provedor de mensagens). Cada código custa uma mensagem.
export async function pedirCodigo(slug: string, telefoneDigitado: string, passe?: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  if (!formasDeEntrar().sms) return { ok: false, mensagem: "Entrar com o celular não está disponível agora. Use o e-mail." };
  const telefone = telefoneComPais(String(telefoneDigitado));
  if (!telefone) return { ok: false, mensagem: "Informe o celular com DDD." };

  const supabase = await createClient();
  if (await sessaoDaEquipe(supabase)) return { ok: false, mensagem: MENSAGEM_EQUIPE };

  const ip = await ipDoCliente();
  if (!consumirLimite(`codigo:tel:${telefone}`, 3, DEZ_MINUTOS) || (ip && !consumirLimite(`codigo:ip:${ip}`, 10, DEZ_MINUTOS))) {
    return { ok: false, mensagem: "Muitos códigos pedidos. Aguarde alguns minutos e tente de novo." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: `+${telefone}`,
    options: { shouldCreateUser: true, captchaToken: typeof passe === "string" && passe ? passe : undefined },
  });
  if (falhouAntiRobo(error)) return { ok: false, mensagem: MENSAGEM_ANTI_ROBO };
  if (error) {
    console.error("[entrar] código não enviado:", error.code, error.message);
    if (error.status === 429) return { ok: false, mensagem: "Muitos códigos pedidos. Aguarde um pouco e tente de novo." };
    return { ok: false, mensagem: "Não foi possível enviar o código agora. Tente de novo ou peça sem entrar." };
  }
  return { ok: true };
}

export async function confirmarCodigo(slug: string, telefoneDigitado: string, codigoDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const telefone = telefoneComPais(String(telefoneDigitado));
  const codigo = String(codigoDigitado).replace(/\D/g, "");
  if (!telefone) return { ok: false, mensagem: "Informe o celular com DDD." };
  if (codigo.length !== 6) return { ok: false, mensagem: "O código tem 6 números." };
  if (!consumirLimite(`codigo:verificar:${telefone}`, 6, DEZ_MINUTOS)) {
    return { ok: false, mensagem: "Muitas tentativas. Peça um código novo daqui a alguns minutos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone: `+${telefone}`, token: codigo, type: "sms" });
  if (error || !data.user) return { ok: false, mensagem: "Código errado ou vencido. Confira ou peça outro." };
  return depoisDeEntrar(supabase, restaurante.id);
}

const nomeSchema = z.string().trim().min(2, "Informe o seu nome.").max(120, "Nome muito longo.");

// Primeira vez neste restaurante: nome e, sem celular confirmado pelo SMS, o celular para contato.
export async function concluirCadastro(slug: string, nomeDigitado: string, telefoneDigitado?: string): Promise<ResultadoEntrar> {
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
