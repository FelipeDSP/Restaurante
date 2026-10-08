import "server-only";

import { createClient } from "@/lib/supabase/server";

// Conta opcional do cliente do delivery (entrou com o telefone + código).
// Só existe para o restaurante onde a pessoa se cadastrou; a sessão do Auth é a mesma do navegador.

export type EnderecoSalvo = {
  id: string;
  bairroId: string;
  rua: string;
  numero: string;
  complemento: string | null;
  referencia: string | null;
};

export type ContaCliente = {
  id: string;
  nome: string;
  telefone: string;
  enderecos: EnderecoSalvo[];
};

export type PedidoDaConta = {
  id: string;
  numero: number;
  status: "recebido" | "em_preparo" | "pronto" | "saiu_entrega" | "entregue" | "cancelado";
  total: number;
  criado_em: string;
};

// Usuário logado com telefone (cliente); conta de equipe (e-mail) não conta como cliente.
export async function usuarioCliente() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.phone || claims.email) return null;
  return { supabase, userId: claims.sub };
}

export async function obterConta(restauranteId: string): Promise<ContaCliente | null> {
  const usuario = await usuarioCliente();
  if (!usuario) return null;
  const { data } = await usuario.supabase
    .from("clientes")
    .select("id, nome, telefone, clientes_enderecos(id, bairro_id, rua, numero, complemento, referencia, usado_em)")
    .eq("restaurante_id", restauranteId)
    .eq("user_id", usuario.userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome,
    telefone: data.telefone,
    enderecos: [...data.clientes_enderecos]
      .sort((a, b) => b.usado_em.localeCompare(a.usado_em))
      .map((e) => ({
        id: e.id,
        bairroId: e.bairro_id,
        rua: e.rua,
        numero: e.numero,
        complemento: e.complemento,
        referencia: e.referencia,
      })),
  };
}

export async function pedidosDaConta(restauranteId: string): Promise<PedidoDaConta[]> {
  const usuario = await usuarioCliente();
  if (!usuario) return [];
  const { data } = await usuario.supabase.rpc("meus_pedidos_cliente", { p_restaurante_id: restauranteId });
  return (data as PedidoDaConta[] | null) ?? [];
}
