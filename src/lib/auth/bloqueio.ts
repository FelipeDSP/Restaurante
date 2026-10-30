import "server-only";

import { ipDoCliente } from "@/lib/limite-taxa";
import { createAdminClient } from "@/lib/supabase/admin";

// Bloqueio de senha errada guardado no banco (rest_privado.tentativas_login, migração bloqueio_login):
// por conta (e-mail) e por IP, com espera que cresce. Vale para o login da equipe, do super admin e
// para a senha atual em "Meu perfil". Conta e-mail que nem existe do mesmo jeito (não revela quem tem conta).
export async function chavesDoLogin(email: string): Promise<string[]> {
  const ip = await ipDoCliente();
  return [`conta:${email.trim().toLowerCase()}`, ...(ip ? [`ip:${ip}`] : [])];
}

export function textoEspera(segundos: number): string {
  const minutos = Math.ceil(segundos / 60);
  if (minutos >= 120) return `Muitas tentativas com senha errada. Tente de novo em ${Math.ceil(minutos / 60)} horas ou use "Esqueci minha senha".`;
  return `Muitas tentativas com senha errada. Tente de novo em ${minutos} ${minutos === 1 ? "minuto" : "minutos"} ou use "Esqueci minha senha".`;
}

// Segundos de bloqueio que ainda faltam (0 = pode tentar). Sem a chave secreta ou sem o banco,
// não trava ninguém (o login não pode parar por causa do bloqueio).
export async function esperaDoLogin(chaves: string[]): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("login_espera", { p_chaves: chaves });
  return error ? 0 : (data ?? 0);
}

export async function registrarLogin(chaves: string[], ok: boolean): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("login_resultado", { p_chaves: chaves, p_ok: ok });
  return error ? 0 : (data ?? 0);
}
