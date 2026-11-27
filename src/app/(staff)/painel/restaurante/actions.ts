"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { falha, falhaValidacao, mensagemErroBanco, type ResultadoAcao, sucesso } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/dal";
import { fusoSchema, horariosSchema } from "@/lib/horarios";
import { urlImagemDoRestaurante } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  dadosDoFormulario,
  dinheiro,
  inteiroOpcional,
  textoObrigatorio,
  textoOpcional,
} from "@/lib/validacao";

const cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");

// @ de rede social: aceita o que a pessoa colar (com @, com a URL inteira) e guarda só o nome.
function arroba(formato: RegExp, rotulo: string) {
  return z.preprocess(
    (valor) => {
      if (typeof valor !== "string") return null;
      const limpo = valor
        .trim()
        .replace(/^https?:\/\/(www\.)?(instagram|facebook|fb)\.com\//i, "")
        .replace(/^@/, "")
        .replace(/\/+$/, "");
      return limpo || null;
    },
    z.string().regex(formato, `${rotulo}: use só o nome do perfil.`).nullable(),
  );
}

function telefone(rotulo: string) {
  return z.preprocess(
    (valor) => (typeof valor === "string" ? valor.replace(/\D/g, "") || null : null),
    z.string().min(10, `${rotulo}: informe DDD e número.`).max(13).nullable(),
  );
}

export async function salvarRestaurante(_estado: ResultadoAcao, formData: FormData): Promise<ResultadoAcao> {
  const acesso = await exigirPermissao("painel", "restaurante");

  let horarios: unknown;
  try {
    horarios = JSON.parse(String(formData.get("horarios") ?? "{}"));
  } catch {
    return falha("Horários inválidos.", undefined, formData);
  }

  const schema = z.object({
    nome: textoObrigatorio("o nome", 120),
    telefone: telefone("Telefone"),
    whatsapp: telefone("WhatsApp"),
    rua: textoOpcional(120),
    numero: textoOpcional(20),
    bairro: textoOpcional(80),
    complemento: textoOpcional(120),
    cidade: textoOpcional(80),
    uf: textoOpcional(2),
    cor_primaria: cor,
    cor_secundaria: cor,
    logo_url: urlImagemDoRestaurante("rest-logos", acesso.restaurante.id),
    capa_url: urlImagemDoRestaurante("rest-capas", acesso.restaurante.id),
    descricao: textoOpcional(160),
    // Só o @, sem URL (o site monta o endereço). O banco tem o mesmo formato num check.
    instagram: arroba(/^[A-Za-z0-9._]{1,30}$/, "Instagram"),
    facebook: arroba(/^[A-Za-z0-9._-]{1,50}$/, "Facebook"),
    fuso_horario: fusoSchema,
    pedido_minimo: dinheiro("Pedido mínimo"),
    taxa_entrega_modo: z.enum(["fixa", "bairro"]),
    taxa_entrega_fixa: dinheiro("Taxa de entrega"),
    tempo_estimado_entrega_min: inteiroOpcional,
    tempo_estimado_retirada_min: inteiroOpcional,
    servico_percentual: z.coerce.number().int("Taxa de serviço: use um número inteiro.").min(0).max(30, "Taxa de serviço: no máximo 30%."),
    couvert_valor: dinheiro("Couvert"),
    // "0,5,6" = domingo, sexta e sábado.
    couvert_dias: z.preprocess(
      (v) => (typeof v === "string" && v ? v.split(",").map(Number) : []),
      z.array(z.number().int().min(0).max(6)).max(7),
    ),
  });

  const dados = schema.safeParse(dadosDoFormulario(formData));
  if (!dados.success) return falhaValidacao(dados.error, formData);

  const horariosValidos = horariosSchema.safeParse(horarios);
  if (!horariosValidos.success) return falha("Confira os horários de funcionamento.", undefined, formData);

  const { rua, numero, bairro, complemento, cidade, uf, ...resto } = dados.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurantes")
    .update({
      ...resto,
      endereco: { rua, numero, bairro, complemento, cidade, uf: uf?.toUpperCase() ?? null },
      horarios: horariosValidos.data,
      tempo_estimado_entrega_min: resto.tempo_estimado_entrega_min || null,
      tempo_estimado_retirada_min: resto.tempo_estimado_retirada_min || null,
    })
    .eq("id", acesso.restaurante.id);

  if (error) return falha(mensagemErroBanco(error), undefined, formData);

  refresh();
  return sucesso("Dados do restaurante salvos.");
}
