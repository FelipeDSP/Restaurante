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
      const aberta = janelas.find((j) => j.url === destino.href);
      return aberta ? aberta.focus() : self.clients.openWindow(destino.href);
    }),
  );
});
