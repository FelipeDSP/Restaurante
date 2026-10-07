// Planos exibidos no site e no painel.
// ATENÇÃO: preços PROVISÓRIOS (mock) até definir valores e a cobrança (provável Kiwify).
// `linkCheckout` null = botão de assinar desativado ("em breve").

export type IdPlano = "essencial" | "completo";

export type Plano = {
  id: IdPlano;
  nome: string;
  paraQuem: string;
  precoMensal: number; // centavos
  destaque: boolean;
  itens: string[];
  linkCheckout: string | null;
};

export const PLANOS: Plano[] = [
  {
    id: "essencial",
    nome: "Essencial",
    paraQuem: "Espetinho ou lanchonete pequena",
    precoMensal: 8990,
    destaque: false,
    itens: [
      "App do garçom e mapa de mesas",
      "Caixa com resumo da noite",
      "Delivery próprio com a sua marca",
      "Até 3 usuários da equipe",
    ],
    linkCheckout: null,
  },
  {
    id: "completo",
    nome: "Completo",
    paraQuem: "Hamburgueria ou restaurante com salão e delivery",
    precoMensal: 14990,
    destaque: true,
    itens: [
      "Tudo do Essencial",
      "Usuários ilimitados na equipe",
      "Impressão por praça na cozinha (em breve)",
      "Relatórios por período e por garçom (em breve)",
    ],
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
