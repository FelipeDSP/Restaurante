"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirDono } from "@/lib/auth/dal";
import { moverItem, proximaOrdem } from "@/lib/ordenacao";
import { createClient } from "@/lib/supabase/server";
import { id, textoObrigatorio } from "@/lib/validacao";

const numeroMesa = textoObrigatorio("o número ou nome da mesa", 30);

export async function criarMesa(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = z.object({ numero: numeroMesa }).safeParse({ numero: formData.get("numero") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const ordem = await proximaOrdem(supabase, "mesas", acesso.restaurante.id);
  const { error } = await supabase
    .from("mesas")
    .insert({ restaurante_id: acesso.restaurante.id, numero: dados.data.numero, ordem });
  if (error) {
    return falha(error.code === "23505" ? "Já existe uma mesa com esse número." : mensagemErroBanco(error), undefined, formData);
  }

  refresh();
  return sucesso(`Mesa ${dados.data.numero} criada.`);
}

const sequenciaSchema = z
  .object({
    de: z.coerce.number().int().min(1, "Comece em 1 ou mais."),
    ate: z.coerce.number().int().max(500, "No máximo até 500."),
  })
  .refine((v) => v.ate >= v.de, { message: "O fim deve ser maior que o início.", path: ["ate"] })
  .refine((v) => v.ate - v.de < 100, { message: "Crie no máximo 100 mesas por vez.", path: ["ate"] });

export async function criarMesasEmSequencia(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = sequenciaSchema.safeParse({ de: formData.get("de"), ate: formData.get("ate") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { data: existentes, error: erroLeitura } = await supabase
    .from("mesas")
    .select("numero")
    .eq("restaurante_id", acesso.restaurante.id);
  if (erroLeitura) return falha(mensagemErroBanco(erroLeitura));

  const jaExiste = new Set(existentes.map((m) => m.numero));
  let ordem = await proximaOrdem(supabase, "mesas", acesso.restaurante.id);
  const novas = [];
  for (let n = dados.data.de; n <= dados.data.ate; n++) {
    if (!jaExiste.has(String(n))) {
      novas.push({ restaurante_id: acesso.restaurante.id, numero: String(n), ordem: ordem++ });
    }
  }
  if (novas.length === 0) return falha("Todas essas mesas já existem.");

  const { error } = await supabase.from("mesas").insert(novas);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(`${novas.length} ${novas.length === 1 ? "mesa criada" : "mesas criadas"}.`);
}

export async function renomearMesa(mesaId: string, _estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  const dados = z.object({ id, numero: numeroMesa }).safeParse({ id: mesaId, numero: formData.get("numero") });
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("mesas")
    .update({ numero: dados.data.numero })
    .eq("id", dados.data.id)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(error.code === "23505" ? "Já existe uma mesa com esse número." : mensagemErroBanco(error), undefined, formData);
  }

  refresh();
  return sucesso("Mesa atualizada.");
}

export async function alternarMesa(mesaId: string, ativa: boolean): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(mesaId).success) return falha("Mesa inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mesas")
    .update({ ativa: ativa === true })
    .eq("id", mesaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) return falha(mensagemErroBanco(error));

  refresh();
  return sucesso(ativa ? "Mesa ativada." : "Mesa desativada.");
}

export async function moverMesa(mesaId: string, direcao: "cima" | "baixo"): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(mesaId).success) return falha("Mesa inválida.");

  const supabase = await createClient();
  const erro = await moverItem(supabase, "mesas", acesso.restaurante.id, mesaId, direcao === "cima" ? "cima" : "baixo");
  if (erro) return falha("Não foi possível reordenar.");

  refresh();
  return undefined;
}

export async function excluirMesa(mesaId: string): Promise<ResultadoAcao> {
  const acesso = await exigirDono();
  if (!id.safeParse(mesaId).success) return falha("Mesa inválida.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("mesas")
    .delete()
    .eq("id", mesaId)
    .eq("restaurante_id", acesso.restaurante.id);
  if (error) {
    return falha(
      error.code === "23503" ? "Esta mesa já teve comandas e não pode ser excluída. Desative-a." : mensagemErroBanco(error),
    );
  }

  refresh();
  return sucesso("Mesa excluída.");
}
