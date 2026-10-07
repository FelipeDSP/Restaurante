import "server-only";

import { type AdicionalEscolhido, type GrupoAdicionais, lerAdicionais } from "@/lib/adicionais";
import { carregarAdicionaisPorProduto } from "@/lib/adicionais-dados";
import { createClient } from "@/lib/supabase/server";

export type StatusMesa = "livre" | "aberta" | "conta_pedida";

export type MesaNoMapa = {
  id: string;
  numero: string;
  status: StatusMesa;
  comandaId: string | null;
  total: number;
  abertaEm: string | null;
  garcom: string | null;
};

export async function caixaEstaAberto(restauranteId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("caixa_sessoes")
    .select("id", { count: "exact", head: true })
    .eq("restaurante_id", restauranteId)
    .is("fechada_em", null);
  return (count ?? 0) > 0;
}

// Status da mesa é derivado da comanda aberta (não fica guardado em `mesas`).
export async function carregarMapa(restauranteId: string): Promise<MesaNoMapa[]> {
  const supabase = await createClient();
  const [mesas, comandas] = await Promise.all([
    supabase
      .from("mesas")
      .select("id, numero")
      .eq("restaurante_id", restauranteId)
      .eq("ativa", true)
      .order("ordem")
      .order("numero"),
    supabase
      .from("comandas")
      .select("id, mesa_id, status, total, aberta_em, garcom:membros!comandas_restaurante_id_garcom_id_fkey(nome)")
      .eq("restaurante_id", restauranteId)
      .in("status", ["aberta", "conta_pedida"]),
  ]);
  if (mesas.error) throw new Error(mesas.error.message);
  if (comandas.error) throw new Error(comandas.error.message);

  const porMesa = new Map(comandas.data.map((c) => [c.mesa_id, c]));
  return mesas.data.map((mesa) => {
    const comanda = porMesa.get(mesa.id);
    return {
      id: mesa.id,
      numero: mesa.numero,
      status: comanda ? (comanda.status as StatusMesa) : "livre",
      comandaId: comanda?.id ?? null,
      total: comanda?.total ?? 0,
      abertaEm: comanda?.aberta_em ?? null,
      garcom: comanda?.garcom?.nome ?? null,
    };
  });
}

export type ItemComanda = {
  id: string;
  pedidoNumero: number;
  nome: string;
  precoUnitario: number; // produto + opções
  adicionais: AdicionalEscolhido[];
  paraViagem: boolean;
  quantidade: number;
  observacao: string | null;
  total: number;
  criadoEm: string;
  cancelado: boolean;
  motivoCancelamento: string | null;
};

export type PagamentoComanda = {
  id: string;
  valor: number;
  forma: string;
  registradoPor: string | null;
  criadoEm: string;
  estornado: boolean;
};

export type DetalheComanda = {
  id: string;
  status: "aberta" | "conta_pedida";
  pessoas: number | null;
  total: number;
  abertaEm: string;
  garcom: string | null;
  itens: ItemComanda[];
  pagamentos: PagamentoComanda[];
  pago: number;
};

export async function carregarMesa(restauranteId: string, mesaId: string) {
  const supabase = await createClient();
  const { data: mesa, error } = await supabase
    .from("mesas")
    .select("id, numero, ativa")
    .eq("id", mesaId)
    .eq("restaurante_id", restauranteId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mesa;
}

// Comanda aberta da mesa, com itens e pagamentos (ou null se a mesa está livre).
export async function carregarComandaDaMesa(restauranteId: string, mesaId: string): Promise<DetalheComanda | null> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("comandas")
    .select(
      `id, status, pessoas, total, aberta_em,
       garcom:membros!comandas_restaurante_id_garcom_id_fkey(nome),
       pedidos(numero, status, itens_pedido(id, nome_produto, preco_unitario, preco_adicionais, adicionais, para_viagem, quantidade, observacao, total, criado_em, cancelado_em, motivo_cancelamento)),
       pagamentos(id, valor, forma, criado_em, estornado_em, registrado:membros!pagamentos_restaurante_id_registrado_por_fkey(nome))`,
    )
    .eq("restaurante_id", restauranteId)
    .eq("mesa_id", mesaId)
    .in("status", ["aberta", "conta_pedida"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;

  const itens: ItemComanda[] = c.pedidos
    .filter((p) => p.status !== "cancelado")
    .flatMap((p) =>
      p.itens_pedido.map((i) => ({
        id: i.id,
        pedidoNumero: p.numero,
        nome: i.nome_produto,
        precoUnitario: i.preco_unitario + i.preco_adicionais,
        adicionais: lerAdicionais(i.adicionais),
        paraViagem: i.para_viagem,
        quantidade: i.quantidade,
        observacao: i.observacao,
        total: i.total,
        criadoEm: i.criado_em,
        cancelado: i.cancelado_em !== null,
        motivoCancelamento: i.motivo_cancelamento,
      })),
    )
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

  const pagamentos: PagamentoComanda[] = c.pagamentos
    .map((p) => ({
      id: p.id,
      valor: p.valor,
      forma: p.forma,
      registradoPor: p.registrado?.nome ?? null,
      criadoEm: p.criado_em,
      estornado: p.estornado_em !== null,
    }))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));

  return {
    id: c.id,
    status: c.status as DetalheComanda["status"],
    pessoas: c.pessoas,
    total: c.total,
    abertaEm: c.aberta_em,
    garcom: c.garcom?.nome ?? null,
    itens,
    pagamentos,
    pago: pagamentos.filter((p) => !p.estornado).reduce((soma, p) => soma + p.valor, 0),
  };
}

export type ProdutoCardapio = {
  id: string;
  nome: string;
  preco: number;
  descricao: string | null;
  grupos: GrupoAdicionais[];
  paraViagem: boolean; // padrão definido pelo dono
};
export type CategoriaCardapio = { id: string; nome: string; produtos: ProdutoCardapio[] };

// Cardápio do salão: categorias ativas e produtos disponíveis.
export async function carregarCardapioSalao(restauranteId: string): Promise<CategoriaCardapio[]> {
  const supabase = await createClient();
  const adicionais = carregarAdicionaisPorProduto(supabase, restauranteId);
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nome, produtos(id, nome, preco, descricao, disponivel, para_viagem, ordem)")
    .eq("restaurante_id", restauranteId)
    .eq("ativa", true)
    .order("ordem")
    .order("ordem", { referencedTable: "produtos" })
    .order("nome", { referencedTable: "produtos" });
  if (error) throw new Error(error.message);
  const gruposPorProduto = await adicionais;

  return data
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      produtos: c.produtos
        .filter((p) => p.disponivel)
        .map((p) => ({
          id: p.id,
          nome: p.nome,
          preco: p.preco,
          descricao: p.descricao,
          grupos: gruposPorProduto.get(p.id) ?? [],
          paraViagem: p.para_viagem,
        })),
    }))
    .filter((c) => c.produtos.length > 0);
}
