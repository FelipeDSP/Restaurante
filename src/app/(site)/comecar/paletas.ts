// Combinações iniciais de cores (o dono troca depois em Painel > Restaurante).
export const PALETAS = [
  { id: "brasa", nome: "Brasa", primaria: "#b91c1c", secundaria: "#fbbf24" },
  { id: "noite", nome: "Noite", primaria: "#111827", secundaria: "#f59e0b" },
  { id: "oceano", nome: "Oceano", primaria: "#1d4ed8", secundaria: "#facc15" },
  { id: "quintal", nome: "Quintal", primaria: "#166534", secundaria: "#f97316" },
  { id: "vinho", nome: "Vinho", primaria: "#9d174d", secundaria: "#fde68a" },
  { id: "cafe", nome: "Café", primaria: "#5b3a29", secundaria: "#f59e0b" },
] as const;

export type IdPaleta = (typeof PALETAS)[number]["id"];
