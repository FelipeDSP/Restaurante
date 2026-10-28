// Planos exibidos no site e no painel (documento de marketing, 29/10). Todos sem limite de usuários
// e de pedidos. O que cada um libera fica no banco (rest_privado.permissoes_do_plano e plano_tem_qr).
// `linkCheckout` null = botão de assinar desativado ("em breve") até ligar a cobrança (provável Kiwify).

export type IdPlano = "delivery" | "presencial" | "avancado" | "completo";

export type Plano = {
  id: IdPlano;
  nome: string;
  paraQuem: string;
  precoMensal: number; // centavos
  destaque: boolean;
  itens: string[];
  linkCheckout: string | null;
};

const SEM_LIMITES = "Sem limite de usuários e de pedidos";

export const PLANOS: Plano[] = [
  {
    id: "delivery",
    nome: "Delivery",
    paraQuem: "Quem vende só por entrega ou retirada",
    precoMensal: 9990,
    destaque: false,
    itens: [
      "Site de delivery com a sua marca",
      "Caixa, cozinha e impressão",
      "Cupons, entregadores e relatórios",
      SEM_LIMITES,
    ],
    linkCheckout: null,
  },
  {
    id: "presencial",
    nome: "Delivery + Presencial",
    paraQuem: "Delivery e mesas atendidas pelo caixa",
    precoMensal: 14990,
    destaque: false,
    itens: ["Tudo do Delivery", "Mesas e comandas pelo caixa", SEM_LIMITES],
    linkCheckout: null,
  },
  {
    id: "avancado",
    nome: "Avançado",
    paraQuem: "Salão com garçons e delivery",
    precoMensal: 19990,
    destaque: false,
    itens: ["Tudo do Delivery + Presencial", "App do garçom no celular", SEM_LIMITES],
    linkCheckout: null,
  },
  {
    id: "completo",
    nome: "Completo",
    paraQuem: "Salão, garçons, delivery e pedido na mesa",
    precoMensal: 24990,
    destaque: true,
    itens: ["Tudo do Avançado", "Cliente pede pelo QR code da mesa", SEM_LIMITES],
    linkCheckout: null,
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
