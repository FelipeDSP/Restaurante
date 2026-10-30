import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { IdPlano } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";

import type { StatusAssinatura } from "./assinatura";

export { dataBR, diasRestantes, NOME_STATUS, type StatusAssinatura } from "./assinatura";

// Painel da plataforma (super admin). Quem é admin fica no banco (rest_privado.administradores);
// as RPCs admin_* conferem de novo. Para quem não é admin, /admin "não existe".
export const exigirAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/admin/entrar");
  const { data: admin } = await supabase.rpc("admin_sou_admin");
  if (!admin) notFound();
  // Senha sem o código do e-mail não abre o painel (o banco também recusa as funções admin_*).
  const { data: verificada } = await supabase.rpc("admin_sessao_verificada");
  if (!verificada) redirect("/admin/entrar");
  return { supabase, email: (data.claims.email as string | undefined) ?? "" };
});

export type RestauranteResumo = {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  criado_em: string;
  dono_nome: string | null;
  dono_email: string | null;
  plano: IdPlano | null;
  assinatura_status: StatusAssinatura | null;
  teste_termina_em: string | null;
  periodo_termina_em: string | null;
  ultimo_caixa: string | null;
  pedidos_30d: number;
  delivery_30d: number;
};

export type PainelAdmin = {
  totais: {
    restaurantes: number;
    ativos: number;
    em_teste: number;
    teste_vencendo: number;
    teste_vencido: number;
    pagantes: number;
    cortesia: number;
    atrasados: number;
    cadastros_30d: number;
    usaram_7d: number;
    pedidos_30d: number;
    vendido_30d: number;
  };
  restaurantes: RestauranteResumo[];
};

export type FichaRestaurante = {
  restaurante: {
    id: string;
    nome: string;
    slug: string;
    ativo: boolean;
    criado_em: string;
    telefone: string | null;
    whatsapp: string | null;
    endereco: Record<string, string | null> | null;
    fuso_horario: string;
    aceita_delivery: boolean;
    logo_url: string | null;
    cor_primaria: string | null;
  };
  assinatura: {
    plano: IdPlano;
    status: StatusAssinatura;
    teste_termina_em: string | null;
    periodo_termina_em: string | null;
    provedor: string | null;
    atualizado_em: string;
  } | null;
  equipe: { nome: string; papel: string; ativo: boolean; email: string | null; ultimo_acesso: string | null }[];
  uso: {
    produtos: number;
    mesas: number;
    bairros: number;
    clientes: number;
    caixas_30d: number;
    ultimo_caixa: string | null;
    pedidos_30d: number;
    delivery_30d: number;
    vendido_30d: number;
  };
  registros: { acao: string; dados: Record<string, unknown>; em: string; por: string | null }[];
};

export async function carregarPainel(): Promise<PainelAdmin> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_painel");
  if (error) throw new Error(error.message);
  return data as unknown as PainelAdmin;
}

export async function carregarFicha(restauranteId: string): Promise<FichaRestaurante | null> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_restaurante", { p_restaurante_id: restauranteId });
  if (error) throw new Error(error.message);
  return (data as unknown as FichaRestaurante | null) ?? null;
}

export type Financeiro = {
  por_plano: { plano: IdPlano; status: StatusAssinatura; quantidade: number }[];
  inadimplentes: {
    id: string;
    nome: string;
    plano: IdPlano;
    status: StatusAssinatura;
    periodo_termina_em: string | null;
    fatura_url: string | null;
  }[];
  pagamentos: { restaurante_id: string | null; nome: string | null; valor: number; em: string }[];
};

export async function carregarFinanceiro(): Promise<Financeiro> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_financeiro");
  if (error) throw new Error(error.message);
  return data as unknown as Financeiro;
}

export type DetalhesRestaurante = {
  cobranca: {
    provedor: string | null;
    cliente_id: string | null;
    assinatura_id: string | null;
    fatura_url: string | null;
    eventos: { evento: string; em: string; valor: number | null; vencimento: string | null }[];
  } | null;
  por_dia: { dia: string; pedidos: number; vendido: number }[];
  notas: { texto: string; em: string; por: string | null }[];
};

export async function carregarDetalhes(restauranteId: string): Promise<DetalhesRestaurante | null> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_restaurante_detalhes", { p_restaurante_id: restauranteId });
  if (error) throw new Error(error.message);
  return (data as unknown as DetalhesRestaurante | null) ?? null;
}

export type Administrador = { user_id: string; email: string; desde: string; ultimo_acesso: string | null; voce: boolean };

export async function carregarAdmins(): Promise<Administrador[]> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_listar_admins");
  if (error) throw new Error(error.message);
  return (data as unknown as Administrador[]) ?? [];
}

export const MODULOS = [
  { id: "mesas", nome: "Mesas pelo caixa" },
  { id: "garcom", nome: "App do garçom" },
  { id: "qr", nome: "Pedido pelo QR da mesa" },
  { id: "cozinha", nome: "Tela da cozinha e impressão" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "cupons", nome: "Cupons" },
  { id: "entregadores", nome: "Entregadores" },
] as const;
export type IdModulo = (typeof MODULOS)[number]["id"];

export type EquipeAdmin = {
  membros: {
    id: string;
    user_id: string;
    nome: string;
    papel: string;
    funcao_id: string | null;
    funcao: string | null;
    ativo: boolean;
    email: string | null;
    ultimo_acesso: string | null;
  }[];
  funcoes: { id: string; nome: string }[];
  modulos: { plano: IdPlano; status: StatusAssinatura; liberados: IdModulo[]; bloqueados: IdModulo[]; efetivos: IdModulo[] } | null;
};

export async function carregarEquipe(restauranteId: string): Promise<EquipeAdmin> {
  const { supabase } = await exigirAdmin();
  const { data, error } = await supabase.rpc("admin_equipe", { p_restaurante_id: restauranteId });
  if (error) throw new Error(error.message);
  return data as unknown as EquipeAdmin;
}
