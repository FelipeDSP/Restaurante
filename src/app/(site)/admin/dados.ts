import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import type { StatusAssinatura } from "./assinatura";

export { dataBR, diasRestantes, NOME_STATUS, type StatusAssinatura } from "./assinatura";

// Painel da plataforma (super admin). Quem é admin fica no banco (rest_privado.administradores);
// as RPCs admin_* conferem de novo. Para quem não é admin, /admin "não existe".
export const exigirAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?next=/admin");
  const { data: admin } = await supabase.rpc("admin_sou_admin");
  if (!admin) notFound();
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
  plano: "essencial" | "completo" | null;
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
    plano: "essencial" | "completo";
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
