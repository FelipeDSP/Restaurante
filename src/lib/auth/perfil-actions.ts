"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { chavesDoLogin, esperaDoLogin, registrarLogin, textoEspera } from "@/lib/auth/bloqueio";
import { obterContexto } from "@/lib/auth/dal";
import { consumirLimite } from "@/lib/limite-taxa";
import { createClient } from "@/lib/supabase/server";
import { origemDoSite } from "@/lib/url";

// "Meu perfil": cada pessoa da equipe mexe só no que é dela (o banco confere pela sessão).
async function exigirMembro() {
  const { usuario, vinculos } = await obterContexto();
  if (!usuario || vinculos.length === 0) return null;
  return usuario;
}

export async function salvarPerfil(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  if (!(await exigirMembro())) return falha("Entre de novo para mudar o perfil.");
  const dados = z
    .object({
      nome: z.string().trim().min(1, "Informe o seu nome.").max(80, "Máximo de 80 caracteres."),
      telefone: z
        .string()
        .transform((t) => t.replace(/\D/g, ""))
        .refine((t) => t === "" || /^\d{10,13}$/.test(t), "Use DDD e número."),
      foto_url: z.string().max(500),
    })
    .safeParse({ nome: formData.get("nome"), telefone: formData.get("telefone") ?? "", foto_url: formData.get("foto_url") ?? "" });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_meu_perfil", {
    p_nome: dados.data.nome,
    p_telefone: dados.data.telefone,
    p_foto_url: dados.data.foto_url,
  });
  if (error) return falha(mensagemErroBanco(error), undefined, formData);
  refresh();
  return sucesso("Perfil salvo.");
}

// O e-mail só muda depois que a pessoa clica no link enviado para o endereço novo.
export async function trocarEmail(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const usuario = await exigirMembro();
  if (!usuario) return falha("Entre de novo para mudar o e-mail.");
  const dados = z.object({ email: z.email("Informe um e-mail válido.").trim().toLowerCase() }).safeParse({ email: formData.get("email") });
  if (!dados.success) return falhaValidacao(dados.error, formData);
  if (dados.data.email === usuario.email) return falha("Esse já é o seu e-mail.", undefined, formData);
  if (!consumirLimite(`perfil:email:${usuario.id}`, 5, 60 * 60_000)) return falha("Muitas tentativas. Tente de novo mais tarde.", undefined, formData);

  const supabase = await createClient();
  const origem = await origemDoSite();
  const { error } = await supabase.auth.updateUser(
    { email: dados.data.email },
    { emailRedirectTo: `${origem}/auth/confirmar?next=/painel/perfil` },
  );
  if (error) {
    return falha(
      error.code === "email_exists" ? "Esse e-mail já é de outra conta." : "Não foi possível trocar o e-mail. Tente de novo.",
      undefined,
      formData,
    );
  }
  return sucesso(`Enviamos um link para ${dados.data.email}. O e-mail muda quando você abrir o link.`);
}

// Pede a senha atual (alguém com o celular destravado não troca a senha de outra pessoa).
export async function trocarSenha(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const usuario = await exigirMembro();
  if (!usuario?.email) return falha("Entre de novo para mudar a senha.");
  const dados = z
    .object({
      atual: z.string().min(1, "Informe a senha atual."),
      senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72),
      confirmacao: z.string(),
    })
    .refine((d) => d.senha === d.confirmacao, { message: "As senhas não são iguais.", path: ["confirmacao"] })
    .safeParse({ atual: formData.get("atual"), senha: formData.get("senha"), confirmacao: formData.get("confirmacao") });
  if (!dados.success) return falhaValidacao(dados.error);
  // Senha atual errada conta no mesmo bloqueio do login (quem adivinha aqui também trava).
  const chaves = await chavesDoLogin(usuario.email);
  const espera = await esperaDoLogin(chaves);
  if (espera > 0) return falha(textoEspera(espera));

  const supabase = await createClient();
  const { error: erroAtual } = await supabase.auth.signInWithPassword({ email: usuario.email, password: dados.data.atual });
  const bloqueio = await registrarLogin(chaves, !erroAtual);
  if (erroAtual) {
    const mensagem = bloqueio > 0 ? textoEspera(bloqueio) : "A senha atual não confere.";
    return falha(mensagem, { atual: mensagem });
  }

  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return falha(error.code === "same_password" ? "Use uma senha diferente da atual." : "Não foi possível trocar a senha. Tente de novo.");
  return sucesso("Senha trocada.");
}
