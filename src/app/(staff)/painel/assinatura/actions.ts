"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import {
  asaasConfigurado,
  atualizarAssinatura,
  cpfCnpjValido,
  criarAssinatura,
  criarCliente,
  ErroAsaas,
  faturaEmAberto,
} from "@/lib/asaas";
import { exigirDono } from "@/lib/auth/dal";
import { type IdPlano, planoPorId } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoAssinar = { ok: true; url: string | null; mensagem: string } | { ok: false; mensagem: string; pedirDocumento?: boolean };

const IDS = ["delivery", "presencial", "avancado", "completo"] as const satisfies readonly IdPlano[];

// Data AAAA-MM-DD no fuso do restaurante.
function dataNoFuso(data: Date, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

// O dono escolhe (ou troca) o plano: cliente e assinatura no Asaas, e o link da fatura para pagar.
// A assinatura só fica "Ativa" quando o Asaas avisa o pagamento (webhook); o plano escolhido já vale.
export async function assinarPlano(plano: string, documento?: string): Promise<ResultadoAssinar> {
  const acesso = await exigirDono();
  const dados = z.object({ plano: z.enum(IDS), documento: z.string().max(30).optional() }).safeParse({ plano, documento });
  const escolhido = dados.success ? planoPorId(dados.data.plano) : undefined;
  if (!dados.success || !escolhido) return { ok: false, mensagem: "Plano inválido." };
  if (!asaasConfigurado()) return { ok: false, mensagem: "A assinatura online ainda não está ligada." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, mensagem: "Não foi possível falar com o sistema de cobrança. Tente de novo." };
  const restauranteId = acesso.restaurante.id;
  const { data: a } = await admin
    .from("assinaturas")
    .select("status, teste_termina_em, provedor, provedor_cliente_id, provedor_assinatura_id")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (!a) return { ok: false, mensagem: "Assinatura não encontrada." };
  if (a.status === "cortesia") return { ok: false, mensagem: "Sua conta é cortesia: não há o que pagar." };

  const descricao = `Plano ${escolhido.nome} · ${acesso.restaurante.nome}`;
  try {
    let clienteId = a.provedor === "asaas" ? a.provedor_cliente_id : null;
    if (!clienteId) {
      const cpfCnpj = cpfCnpjValido(dados.data.documento ?? "");
      if (!cpfCnpj) {
        return { ok: false, mensagem: dados.data.documento ? "Confira o CPF ou CNPJ." : "Informe o CPF ou CNPJ de quem paga.", pedirDocumento: true };
      }
      clienteId = (await criarCliente({ nome: acesso.restaurante.nome, cpfCnpj, email: acesso.usuario.email, restauranteId })).id;
      await admin.from("assinaturas").update({ provedor: "asaas", provedor_cliente_id: clienteId, atualizado_em: new Date().toISOString() }).eq("restaurante_id", restauranteId);
    }

    let assinaturaId = a.provedor === "asaas" ? a.provedor_assinatura_id : null;
    if (assinaturaId) {
      await atualizarAssinatura(assinaturaId, { valorCentavos: escolhido.precoMensal, descricao });
    } else {
      // No teste, a primeira cobrança vence quando o teste acaba; depois dele, hoje.
      const fimTeste = a.status === "teste" && a.teste_termina_em ? new Date(a.teste_termina_em) : null;
      const vencimento = fimTeste && fimTeste.getTime() > Date.now() ? fimTeste : new Date();
      assinaturaId = (
        await criarAssinatura({
          clienteId,
          valorCentavos: escolhido.precoMensal,
          primeiroVencimento: dataNoFuso(vencimento, acesso.restaurante.fusoHorario),
          descricao,
          restauranteId,
        })
      ).id;
    }

    const url = await faturaEmAberto(assinaturaId).catch(() => null);
    const { error } = await admin
      .from("assinaturas")
      .update({ provedor_assinatura_id: assinaturaId, plano: escolhido.id, fatura_url: url, atualizado_em: new Date().toISOString() })
      .eq("restaurante_id", restauranteId);
    if (error) throw new Error(error.message);

    refresh();
    return { ok: true, url, mensagem: `Plano ${escolhido.nome} escolhido.` };
  } catch (erro) {
    if (erro instanceof ErroAsaas) return { ok: false, mensagem: erro.message };
    console.error("[assinatura]", erro);
    return { ok: false, mensagem: "Não foi possível concluir. Tente de novo." };
  }
}
