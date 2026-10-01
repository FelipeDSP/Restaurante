import type { Papel } from "@/lib/auth/papeis";

// Itens do menu do painel; cada etapa acrescenta os seus. "descricao" vira atalho na página inicial.
export const NAVEGACAO: { href: string; rotulo: string; papeis: Papel[]; descricao?: string }[] = [
  { href: "/painel", rotulo: "Início", papeis: ["dono", "caixa"] },
  { href: "/painel/produtos", rotulo: "Produtos", papeis: ["dono"], descricao: "Cardápio, preços, fotos e disponibilidade" },
  { href: "/painel/categorias", rotulo: "Categorias", papeis: ["dono"], descricao: "Seções e ordem do cardápio" },
  { href: "/painel/mesas", rotulo: "Mesas", papeis: ["dono"], descricao: "Mesas do salão" },
  { href: "/painel/bairros", rotulo: "Bairros", papeis: ["dono"], descricao: "Áreas e taxas de entrega" },
  { href: "/painel/equipe", rotulo: "Equipe", papeis: ["dono"], descricao: "Pessoas, papéis e senhas" },
  { href: "/painel/restaurante", rotulo: "Restaurante", papeis: ["dono"], descricao: "Marca, horários e delivery" },
];
