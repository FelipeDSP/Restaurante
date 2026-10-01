"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { PAPEIS } from "@/lib/auth/papeis";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

const SEM_CHAVE =
  "Cadastro de contas indisponível: configure SUPABASE_SECRET_KEY no servidor.";

const papel = z.enum(PAPEIS, { error: "Escolha o papel." });
const senha = z.string().min(8, "A senha precisa de pelo menos 8 caracteres.").max(72);

const novoMembroSchema = z.object({
  nome: textoObrigatorio("o nome", 120),
  email: z.email("Informe um e-mail válido.").trim().toLowerCase(),
  papel,
  senha: z.preprocess((v) => (v === "" ? undefined : v), senha.optional()),
});

export async function adicionarMembro(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = novoMembroSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    papel: formData.get("papel"),
    senha: formData.get("senha"),
  });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const admin = createAdminClient();
  if (!admin) return falha(SEM_CHAVE, undefined, formData);

  // Conta existente (ex.: já trabalha em outro restaurante): só vincula, sem mexer na senha.
  const { data: existente, error: erroBusca } = await admin.rpc("buscar_usuario_por_email", {
    p_email: dados.data.email,
  });
  if (erroBusca) return falha("Não foi possível verificar o e-mail.", undefined, formData);

  let userId = existente;
  let contaCriada = false;
  if (!userId) {
    if (!dados.data.senha) {
      return falha("Defina uma senha inicial para a nova conta.", { senha: "Obrigatória para conta nova." }, formData);
    }
    const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
      email: dados.data.email,
      password: dados.data.senha,
      email_confirm: true,
    });
    if (erroCriacao || !criado.user) {
      return falha(erroCriacao?.code === "weak_password" ? "Senha fraca: escolha outra." : "Não foi possível criar a conta.", undefined, formData);
    }
    userId = criado.user.id;
    contaCriada = true;
  }

  // Vínculo gravado com a sessão do dono: a RLS confere que ele é dono deste restaurante.
  const supabase = await createClient();
  const { error } = await supabase.from("membros").insert({
    restaurante_id: acesso.restaurante.id,
    user_id: userId,
    nome: dados.data.nome,
    papel: dados.data.papel,
  });
  if (error) {
    if (contaCriada) await admin.auth.admin.deleteUser(userId);
    return falha(
      error.code === "23505"
        ? "Essa pessoa já faz parte da equipe (veja na lista; pode estar inativa)."
        : mensagemErroBanco(error),
      undefined,
      formData,
    );
  }

  refresh();
  return sucesso(
    contaCriada
      ? `${dados.data.nome} adicionado(a). Passe o e-mail e a senha inicial para o primeiro acesso.`
      : `${dados.data.nome} já tinha conta e foi vinculado(a) com a senha atual.`,
  );
}

export async function atualizarMembro(membroId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = z
    .object({ id, nome: textoObrigatorio("o nome", 120), papel })
    .safeParse({ id: membroId, nome: formData.get("nome"), papel: formData.get("papel") });
  if (!dados.success) return falhaValidacao(dados.error, formData);
  if (dados.data.id === acesso.membroId && dados.data.papel !== acesso.papel) {
    return falha("Você não pode alterar o seu próprio papel.", undefined, formData);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("membros")
    .update({ nome: dados.data.nome, papel: dados.data.papel })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Membro atualizado.");
}

export async function alternarMembro(membroId: string, ativo: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(membroId).success) return falha("Membro inválido.");
  if (membroId === acesso.membroId) return falha("Você não pode desativar a si mesmo.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("membros")
    .update({ ativo: ativo === true })
    .eq("id", membroId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativo ? "Acesso reativado." : "Acesso desativado.");
}

export async function redefinirSenha(membroId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = z.object({ id, senha }).safeParse({ id: membroId, senha: formData.get("senha") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const admin = createAdminClient();
  if (!admin) return falha(SEM_CHAVE);

  // Busca com a sessão do dono: só encontra membros do próprio restaurante.
  const supabase = await createClient();
  const { data: membro } = await supabase
    .from("membros")
    .select("user_id")
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id)
    .maybeSingle();
  if (!membro) return falha("Membro não encontrado.");

  // Conta compartilhada com outro restaurante: um dono não troca a senha usada lá.
  const { data: vinculos } = await admin.rpc("contar_restaurantes_do_usuario", { p_user_id: membro.user_id });
  if ((vinculos ?? 0) > 1) {
    return falha("Esta conta também é usada em outro restaurante; a própria pessoa precisa trocar a senha.");
  }

  const { error } = await admin.auth.admin.updateUserById(membro.user_id, { password: dados.data.senha });
  if (error) return falha(error.code === "weak_password" ? "Senha fraca: escolha outra." : "Não foi possível trocar a senha.");

  return sucesso("Senha redefinida.");
}
