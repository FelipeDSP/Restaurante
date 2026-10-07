import type { Papel } from "@/lib/auth/papeis";

export type GrupoNavegacao = "Operação" | "Cardápio" | "Configurações" | "Conta";

export type ItemNavegacao = { href: string; rotulo: string; grupo: GrupoNavegacao; papeis: Papel[]; descricao?: string };

export const GRUPOS: GrupoNavegacao[] = ["Operação", "Cardápio", "Configurações", "Conta"];

// Itens do menu do painel, agrupados; "descricao" vira atalho na página inicial.
export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/comandas", rotulo: "Comandas", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/produtos", rotulo: "Produtos", grupo: "Cardápio", papeis: ["dono"], descricao: "Cardápio, preços, fotos e disponibilidade" },
  { href: "/painel/categorias", rotulo: "Categorias", grupo: "Cardápio", papeis: ["dono"], descricao: "Seções e ordem do cardápio" },
  { href: "/painel/adicionais", rotulo: "Adicionais", grupo: "Cardápio", papeis: ["dono"], descricao: "Ponto da carne, sabores e adicionais com preço" },
  { href: "/painel/restaurante", rotulo: "Restaurante", grupo: "Configurações", papeis: ["dono"], descricao: "Marca, horários e delivery" },
  { href: "/painel/mesas", rotulo: "Mesas", grupo: "Configurações", papeis: ["dono"], descricao: "Mesas do salão" },
  { href: "/painel/bairros", rotulo: "Bairros de entrega", grupo: "Configurações", papeis: ["dono"], descricao: "Áreas e taxas de entrega" },
  { href: "/painel/equipe", rotulo: "Equipe", grupo: "Configurações", papeis: ["dono"], descricao: "Pessoas, papéis e senhas" },
  { href: "/painel/pracas", rotulo: "Setores da cozinha", grupo: "Configurações", papeis: ["dono"], descricao: "Churrasqueira, chapa, bar: para onde vai cada pedido" },
  { href: "/painel/impressoras", rotulo: "Impressoras", grupo: "Configurações", papeis: ["dono", "caixa"], descricao: "Computador do caixa, impressoras e o que sai em cada uma" },
  { href: "/painel/assinatura", rotulo: "Assinatura", grupo: "Conta", papeis: ["dono"], descricao: "Plano, teste grátis e pagamento" },
];

// Item ativo: o mais específico que casa com o caminho (Início só na própria página).
export function itemAtivo(itens: ItemNavegacao[], caminho: string): string | null {
  const candidatos = itens.filter((i) => (i.href === "/painel" ? caminho === "/painel" : caminho === i.href || caminho.startsWith(`${i.href}/`)));
  return candidatos.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
