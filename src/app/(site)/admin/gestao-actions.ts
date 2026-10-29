"use server";

import { randomInt } from "node:crypto";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { falha, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { gravarRestauranteAtivo } from "@/lib/auth/cookie-restaurante";
import { COOKIE_SUPORTE } from "@/lib/auth/suporte";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

import { exigirAdmin, MODULOS } from "./dados";

// Gestão de qualquer restaurante pelo super admin. As RPCs admin_* conferem de novo que é admin e
// registram tudo; a chave secreta só cria/altera contas de login, sempre depois de exigirAdmin().

const SEM_CHAVE = "Indisponível: configure SUPABASE_SECRET_KEY no servidor.";
const IDS_MODULOS = MODULOS.map((m) => m.id) as [string, ...string[]];

// Senha inicial fácil de ditar pelo WhatsApp (sem letras parecidas: 0/O, 1/l).
function gerarSenha(): string {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const numeros = "23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += letras[randomInt(letras.length)];
  for (let i = 0; i < 4; i++) s += numeros[randomInt(numeros.length)];
  return s;
}

export type ResultadoConta = { ok: true; mensagem: string; senha?: string } | { ok: false; mensagem: string };

// Conta de login pelo e-mail: usa a que existe (sem mexer na senha) ou cria uma com senha gerada.
async function contaPorEmail(email: string): Promise<{ userId: string; senha?: string } | { erro: string }> {
  const admin = createAdminClient();
  if (!admin) return { erro: SEM_CHAVE };
  const { data: existente, error } = await admin.rpc("buscar_usuario_por_email", { p_email: email });
  if (error) return { erro: "Não foi possível verificar o e-mail." };
  if (existente) return { userId: existente };
  const senha = gerarSenha();
  const { data, error: erroCriacao } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (erroCriacao || !data.user) return { erro: "Não foi possível criar a conta." };
  return { userId: data.user.id, senha };
}

export async function definirModulos(restauranteId: string, liberados: string[], bloqueados: string[]): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const lista = z.array(z.enum(IDS_MODULOS)).max(IDS_MODULOS.length);
  const dados = z.object({ restauranteId: id, liberados: lista, bloqueados: lista }).safeParse({ restauranteId, liberados, bloqueados });
  if (!dados.success) return falha("Dados inválidos.");
  const { error } = await supabase.rpc("admin_definir_modulos", {
    p_restaurante_id: dados.data.restauranteId,
    p_liberados: dados.data.liberados,
    p_bloqueados: dados.data.bloqueados,
  });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Módulos salvos.");
}

const funcao = z.union([z.literal("dono"), id], { error: "Escolha a função." });

export async function adicionarPessoa(
  restauranteId: string,
  entrada: { nome: string; email: string; funcao: string },
): Promise<ResultadoConta> {
  const { supabase } = await exigirAdmin();
  const dados = z
    .object({ restauranteId: id, nome: textoObrigatorio("o nome", 120), email: z.email("Informe um e-mail válido.").trim().toLowerCase(), funcao })
    .safeParse({ restauranteId, ...entrada });
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Confira os dados." };
  const conta = await contaPorEmail(dados.data.email);
  if ("erro" in conta) return { ok: false, mensagem: conta.erro };

  const { error } = await supabase.rpc("admin_adicionar_membro", {
    p_restaurante_id: dados.data.restauranteId,
    p_user_id: conta.userId,
    p_nome: dados.data.nome,
    p_funcao: dados.data.funcao,
  });
  if (error) {
    if (conta.senha) await createAdminClient()?.auth.admin.deleteUser(conta.userId);
    return { ok: false, mensagem: mensagemErroBanco(error) };
  }
  if (conta.senha) {
    await supabase.rpc("admin_registrar", { p_restaurante_id: dados.data.restauranteId, p_acao: "conta_criada", p_dados: { email: dados.data.email } });
  }
  refresh();
  return conta.senha
    ? { ok: true, mensagem: `${dados.data.nome} adicionado(a) com conta nova.`, senha: conta.senha }
    : { ok: true, mensagem: `${dados.data.nome} já tinha conta e foi vinculado(a) com a senha atual.` };
}

export async function salvarPessoa(membroId: string, entrada: { nome: string; funcao: string; ativo: boolean }): Promise<ResultadoAcao> {
  const { supabase } = await exigirAdmin();
  const dados = z
    .object({ membroId: id, nome: textoObrigatorio("o nome", 120), funcao, ativo: z.boolean() })
    .safeParse({ membroId, ...entrada });
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Confira os dados.");
  const { error } = await supabase.rpc("admin_salvar_membro", {
    p_membro_id: dados.data.membroId,
    p_nome: dados.data.nome,
    p_funcao: dados.data.funcao,
    p_ativo: dados.data.ativo,
  });
  if (error) return falha(mensagemErroBanco(error));
  refresh();
  return sucesso("Salvo.");
}

// Senha nova para qualquer conta (a pessoa esqueceu). Mostrada uma vez para mandar pelo WhatsApp.
export async function trocarSenha(restauranteId: string, userId: string, email: string): Promise<ResultadoConta> {
  const { supabase } = await exigirAdmin();
  if (!id.safeParse(restauranteId).success || !id.safeParse(userId).success) return { ok: false, mensagem: "Dados inválidos." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, mensagem: SEM_CHAVE };
  // Só conta que é da equipe deste restaurante (o admin escolhe pela ficha, nunca um id qualquer).
  const { data: membro } = await admin.from("membros").select("id").eq("restaurante_id", restauranteId).eq("user_id", userId).maybeSingle();
  if (!membro) return { ok: false, mensagem: "Essa conta não é deste restaurante." };
  const senha = gerarSenha();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: senha });
  if (error) return { ok: false, mensagem: "Não foi possível trocar a senha." };
  await supabase.rpc("admin_registrar", { p_restaurante_id: restauranteId, p_acao: "senha_trocada", p_dados: { email } });
  return { ok: true, mensagem: "Senha trocada.", senha };
}

export async function criarRestaurante(entrada: {
  nome: string;
  slug: string;
  nomeDono: string;
  emailDono: string;
  whatsapp: string;
  fuso: string;
}): Promise<ResultadoConta & { restauranteId?: string }> {
  const { supabase } = await exigirAdmin();
  const dados = z
    .object({
      nome: textoObrigatorio("o nome do restaurante", 80),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Endereço: letras minúsculas, números e hífen.").min(3).max(40),
      nomeDono: textoObrigatorio("o nome do dono", 80),
      emailDono: z.email("Informe o e-mail do dono.").trim().toLowerCase(),
      whatsapp: z.string().trim().max(20),
      fuso: z.string().trim().max(60),
    })
    .safeParse(entrada);
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Confira os dados." };
  const d = dados.data;
  const { data: livre } = await supabase.rpc("slug_disponivel", { p_slug: d.slug });
  if (livre === false) return { ok: false, mensagem: "Esse endereço já está em uso ou é reservado." };

  const conta = await contaPorEmail(d.emailDono);
  if ("erro" in conta) return { ok: false, mensagem: conta.erro };
  const { data: restauranteId, error } = await supabase.rpc("admin_criar_restaurante", {
    p_dono_user_id: conta.userId,
    p_nome: d.nome,
    p_slug: d.slug,
    p_nome_dono: d.nomeDono,
    p_fuso: d.fuso || "America/Sao_Paulo",
    p_whatsapp: d.whatsapp.replace(/\D/g, ""),
  });
  if (error || !restauranteId) {
    if (conta.senha) await createAdminClient()?.auth.admin.deleteUser(conta.userId);
    return { ok: false, mensagem: error ? mensagemErroBanco(error) : "Não foi possível criar o restaurante." };
  }
  refresh();
  return {
    ok: true,
    mensagem: conta.senha ? "Restaurante criado com a conta nova do dono." : "Restaurante criado. O dono já tinha conta e entra com a senha dele.",
    senha: conta.senha,
    restauranteId,
  };
}

// "Entrar como": abre o painel do restaurante como o dono, sem a senha dele (link de acesso de uso
// único gerado pelo servidor). A sessão de admin é trocada pela do dono; fica registrado e a faixa
// "Modo suporte" aparece no painel até sair.
export async function entrarComo(restauranteId: string): Promise<ResultadoAcao> {
  const { supabase, email: emailAdmin } = await exigirAdmin();
  if (!id.safeParse(restauranteId).success) return falha("Dados inválidos.");
  const admin = createAdminClient();
  if (!admin) return falha(SEM_CHAVE);

  const { data: dono } = await admin
    .from("membros")
    .select("user_id, nome, restaurante:restaurantes!inner(nome)")
    .eq("restaurante_id", restauranteId)
    .eq("papel", "dono")
    .eq("ativo", true)
    .order("criado_em")
    .limit(1)
    .maybeSingle();
  if (!dono) return falha("Este restaurante não tem dono ativo.");
  const { data: usuario } = await admin.auth.admin.getUserById(dono.user_id);
  const emailDono = usuario.user?.email;
  if (!emailDono) return falha("A conta do dono não tem e-mail.");

  const { error: erroRegistro } = await supabase.rpc("admin_registrar", {
    p_restaurante_id: restauranteId,
    p_acao: "entrou_como",
    p_dados: { email: emailDono },
  });
  if (erroRegistro) return falha(mensagemErroBanco(erroRegistro));

  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({ type: "magiclink", email: emailDono });
  if (erroLink || !link.properties?.hashed_token) return falha("Não foi possível abrir a conta do dono.");
  const { error: erroSessao } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (erroSessao) return falha("Não foi possível abrir a conta do dono.");

  (await cookies()).set(COOKIE_SUPORTE, JSON.stringify({ admin: emailAdmin, dono: dono.nome, restaurante: dono.restaurante.nome }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  await gravarRestauranteAtivo(restauranteId);
  // O navegador recarrega em /painel (página inteira) para começar já com a sessão do dono.
  return sucesso();
}

// Sai do modo suporte: encerra a sessão do dono e volta para a entrada do admin.
export async function sairDoSuporte(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const c = await cookies();
  c.delete(COOKIE_SUPORTE);
  redirect("/admin/entrar");
}
