"use server";

import { z } from "zod";

import { consumirLimite, ipDoCliente } from "@/lib/limite-taxa";
import { loginClienteDisponivel } from "@/lib/mensagens";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { telefoneComPais } from "@/lib/telefone";
import { id } from "@/lib/validacao";

import { usuarioCliente } from "../conta";
import { buscarRestaurantePorSlug } from "../dados";

export type ResultadoEntrar = { ok: true; precisaNome?: boolean; nomeSugerido?: string } | { ok: false; mensagem: string };

const DEZ_MINUTOS = 10 * 60_000;

// Cada código enviado custa uma mensagem: limita por telefone e, mais folgado, por IP.
export async function pedirCodigo(slug: string, telefoneDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  if (!loginClienteDisponivel()) return { ok: false, mensagem: "Entrar com o celular não está disponível agora. Peça sem entrar." };
  const telefone = telefoneComPais(String(telefoneDigitado));
  if (!telefone) return { ok: false, mensagem: "Informe o celular com DDD." };

  const supabase = await createClient();
  // O navegador da equipe (caixa) não pode virar sessão de cliente sem querer.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.email) {
    return { ok: false, mensagem: "Este navegador está conectado com uma conta da equipe. Saia dela para entrar como cliente." };
  }

  const ip = await ipDoCliente();
  if (!consumirLimite(`codigo:tel:${telefone}`, 3, DEZ_MINUTOS) || (ip && !consumirLimite(`codigo:ip:${ip}`, 10, DEZ_MINUTOS))) {
    return { ok: false, mensagem: "Muitos códigos pedidos. Aguarde alguns minutos e tente de novo." };
  }

  const { error } = await supabase.auth.signInWithOtp({ phone: `+${telefone}`, options: { shouldCreateUser: true } });
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

  // Já é cliente deste restaurante? Senão pede o nome (sugere o usado em outro restaurante).
  const { data: cadastros } = await supabase.from("clientes").select("restaurante_id, nome").eq("user_id", data.user.id);
  if (cadastros?.some((c) => c.restaurante_id === restaurante.id)) return { ok: true };
  return { ok: true, precisaNome: true, nomeSugerido: cadastros?.[0]?.nome };
}

const nomeSchema = z.string().trim().min(2, "Informe o seu nome.").max(120, "Nome muito longo.");

export async function concluirCadastro(slug: string, nomeDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const nome = nomeSchema.safeParse(nomeDigitado);
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre com o seu telefone de novo." };

  const { error } = await usuario.supabase.rpc("entrar_como_cliente", { p_restaurante_id: restaurante.id, p_nome: nome.data });
  if (error) return { ok: false, mensagem: error.code === "P0001" ? error.message : "Não foi possível salvar. Tente de novo." };
  return { ok: true };
}

export async function mudarNome(slug: string, nomeDigitado: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const nome = nomeSchema.safeParse(nomeDigitado);
  if (!nome.success) return { ok: false, mensagem: nome.error.issues[0].message };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre com o seu telefone de novo." };
  const { error } = await usuario.supabase
    .from("clientes")
    .update({ nome: nome.data })
    .eq("restaurante_id", restaurante.id)
    .eq("user_id", usuario.userId);
  if (error) return { ok: false, mensagem: "Não foi possível salvar. Tente de novo." };
  return { ok: true };
}

export async function removerEndereco(slug: string, enderecoId: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante || !id.safeParse(enderecoId).success) return { ok: false, mensagem: "Endereço não encontrado." };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre com o seu telefone de novo." };
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
// Se a pessoa não for cliente de nenhum outro restaurante nem da equipe, apaga também o login (telefone).
export async function excluirConta(slug: string): Promise<ResultadoEntrar> {
  const restaurante = await buscarRestaurantePorSlug(slug);
  if (!restaurante) return { ok: false, mensagem: "Restaurante não encontrado." };
  const usuario = await usuarioCliente();
  if (!usuario) return { ok: false, mensagem: "Entre com o seu telefone de novo." };

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
