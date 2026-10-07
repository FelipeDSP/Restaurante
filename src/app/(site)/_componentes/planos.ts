// Planos exibidos no site. Preço null = "lançamento em breve" (valores ainda em definição).
export const PLANOS = [
  {
    id: "essencial",
    nome: "Essencial",
    paraQuem: "Espetinho ou lanchonete pequena",
    precoMensal: null as number | null,
    destaque: false,
    itens: [
      "App do garçom e mapa de mesas",
      "Caixa com resumo da noite",
      "Delivery próprio com a sua marca",
      "Até 3 usuários da equipe",
    ],
  },
  {
    id: "completo",
    nome: "Completo",
    paraQuem: "Hamburgueria ou restaurante com salão e delivery",
    precoMensal: null as number | null,
    destaque: true,
    itens: [
      "Tudo do Essencial",
      "Usuários ilimitados na equipe",
      "Impressão por praça na cozinha (em breve)",
      "Relatórios por período e por garçom (em breve)",
    ],
  },
] as const;

export const DIAS_TESTE_GRATIS = 14;
