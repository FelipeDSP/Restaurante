// Módulos que o super admin libera ou bloqueia por restaurante (ficha do restaurante).
// Lista única: o banco tem a mesma em `rest_privado.modulos_validos()`, e
// `rest_privado.permissoes_do_modulo` diz o que cada um libera.
//
// Fica fora de `dados.ts` (que é `server-only`) porque a tela de gestão é componente de cliente.

export const MODULOS = [
  { id: "mesas", nome: "Mesas pelo caixa" },
  { id: "garcom", nome: "App do garçom" },
  { id: "qr", nome: "Pedido pelo QR da mesa" },
  { id: "cozinha", nome: "Tela da cozinha e impressão" },
  { id: "relatorios", nome: "Relatórios" },
  { id: "cupons", nome: "Cupons" },
  { id: "entregadores", nome: "Entregadores" },
  { id: "estoque", nome: "Controle de estoque" },
] as const;

export type IdModulo = (typeof MODULOS)[number]["id"];
