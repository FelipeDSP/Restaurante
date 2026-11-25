// Planos exibidos no site e no painel (documento de marketing, 29/10). Todos sem limite de usuários
// e de pedidos. O que cada um libera fica no banco (rest_privado.permissoes_do_plano e plano_tem_qr).
// Assinatura e cobrança pelo Asaas (Painel › Assinatura; `src/lib/asaas.ts`).

export type IdPlano = "delivery" | "presencial" | "avancado" | "completo";

export type Plano = {
  id: IdPlano;
  nome: string;
  paraQuem: string;
  precoMensal: number; // centavos
  // Preço da promoção em cartaz (centavos). Só vale enquanto `PROMOCAO.terminaEm` não passou.
  precoPromocional: number;
  destaque: boolean;
  itens: string[];
};

// Promoção em cartaz. Para encerrar, basta a data passar: a landing, o painel e a cobrança
// voltam sozinhos ao preço cheio, sem mexer em código.
export const PROMOCAO = {
  nome: "Black Friday",
  // Fim do dia 30/11/2026 em Porto Velho (UTC-4), o fuso do cliente zero.
  terminaEm: new Date("2026-11-30T23:59:59-04:00"),
};

// A promoção está valendo agora? Quem assina ou troca de plano dentro da janela leva o preço
// promocional; depois dela, o preço cheio.
export function promocaoAtiva(agora: Date = new Date()): boolean {
  return agora <= PROMOCAO.terminaEm;
}

// Quanto este plano custa para quem assinar agora.
export function precoDeHoje(plano: Plano, agora: Date = new Date()): number {
  return promocaoAtiva(agora) ? plano.precoPromocional : plano.precoMensal;
}

// Por quanto tempo o valor contratado na promoção fica garantido (não sobe antes disso).
export const MESES_PRECO_GARANTIDO = 12;

export function precoGarantidoAte(agora: Date = new Date()): Date {
  const ate = new Date(agora);
  ate.setFullYear(ate.getFullYear() + MESES_PRECO_GARANTIDO / 12);
  return ate;
}

const SEM_LIMITES = "Sem limite de usuários e de pedidos";

export const PLANOS: Plano[] = [
  {
    id: "delivery",
    nome: "Delivery",
    paraQuem: "Quem vende só por entrega ou retirada",
    precoMensal: 9990,
    precoPromocional: 6990,
    destaque: false,
    itens: [
      "Site de delivery com a sua marca",
      "Caixa, cozinha e impressão",
      "Cupons, entregadores e relatórios",
      SEM_LIMITES,
    ],
  },
  {
    id: "presencial",
    nome: "Delivery + Presencial",
    paraQuem: "Delivery e mesas atendidas pelo caixa",
    precoMensal: 14990,
    precoPromocional: 11990,
    destaque: false,
    itens: ["Tudo do Delivery", "Mesas e comandas pelo caixa", SEM_LIMITES],
  },
  {
    id: "avancado",
    nome: "Avançado",
    paraQuem: "Salão com garçons e delivery",
    precoMensal: 19990,
    precoPromocional: 13990,
    destaque: false,
    itens: ["Tudo do Delivery + Presencial", "App do garçom no celular", "Controle de estoque", SEM_LIMITES],
  },
  {
    id: "completo",
    nome: "Completo",
    paraQuem: "Salão, garçons, delivery e pedido na mesa",
    precoMensal: 24990,
    precoPromocional: 14990,
    destaque: true,
    itens: ["Tudo do Avançado", "Cliente pede pelo QR code da mesa", SEM_LIMITES],
  },
];

export const DIAS_TESTE_GRATIS = 14;

export function planoPorId(id: string): Plano | undefined {
  return PLANOS.find((p) => p.id === id);
}

// "R$ 89,90" -> partes para exibir o preço grande ("89", ",90").
export function partesPreco(centavos: number): { reais: string; centavos: string } {
  const reais = Math.floor(centavos / 100).toLocaleString("pt-BR");
  return { reais, centavos: `,${String(centavos % 100).padStart(2, "0")}` };
}
