// Service worker do site: só recebe os avisos do pedido (Web Push) e abre o pedido ao tocar.
// Não guarda nada em cache e não intercepta as páginas.

self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : "" };
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || "Seu pedido", {
      body: dados.corpo || "",
      icon: dados.icone,
      badge: dados.icone,
      tag: dados.tag,
      renotify: Boolean(dados.tag),
      data: { url: dados.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  // Só abre endereços do próprio site.
  let destino = new URL("/", self.location.origin);
  try {
    const url = new URL(evento.notification.data?.url || "/", self.location.origin);
    if (url.origin === self.location.origin) destino = url;
  } catch {
    // mantém a página inicial
  }
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // A página do pedido já aberta (com ou sem "#conversa"): usa a mesma aba em vez de abrir outra.
      const aberta = janelas.find((j) => {
        try {
          return new URL(j.url).pathname === destino.pathname;
        } catch {
          return false;
        }
      });
      if (!aberta) return self.clients.openWindow(destino.href);
      const foco = aberta.focus();
      return destino.hash && aberta.url !== destino.href && "navigate" in aberta ? foco.then((j) => j.navigate(destino.href)) : foco;
    }),
  );
});
