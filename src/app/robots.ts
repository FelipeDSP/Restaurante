import type { MetadataRoute } from "next";

// Áreas da equipe e acompanhamento de pedidos não devem aparecer em buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/garcom", "/login", "/inicio", "/selecionar", "/sem-acesso", "/recuperar-senha", "/nova-senha", "/api", "/pwa", "/*/pedido/", "/*/carrinho"],
    },
  };
}
