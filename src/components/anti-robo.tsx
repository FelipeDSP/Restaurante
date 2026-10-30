"use client";

import { useEffect, useRef, useState } from "react";

// Verificação anti-robô (Cloudflare Turnstile) cobrada pelo Supabase Auth em login, cadastro,
// "esqueci a senha" e código do cliente: sem o passe, o Supabase recusa, mesmo quem chama a API
// direto. Quase sempre não pede nada (modo gerenciado). O passe vai no campo escondido "captcha".

type Turnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let script: Promise<void> | null = null;
function carregarScript(): Promise<void> {
  script ??= new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      script = null;
      erro(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return script;
}

let chaveCache: Promise<string | null> | null = null;
function chaveDoSite(): Promise<string | null> {
  chaveCache ??= fetch("/api/anti-robo")
    .then((r) => r.json() as Promise<{ chave: string | null }>)
    .then((r) => r.chave)
    .catch(() => {
      chaveCache = null;
      return null;
    });
  return chaveCache;
}

// rodada: muda a cada envio do formulário; o passe vale uma vez só, então pede outro.
// aoMudar: para formulários controlados (sem <form action>), recebe o passe.
export function AntiRobo({ rodada, aoMudar, tema = "auto" }: { rodada?: unknown; aoMudar?: (token: string) => void; tema?: "auto" | "light" | "dark" }) {
  const caixa = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const avisar = useRef(aoMudar);
  useEffect(() => {
    avisar.current = aoMudar;
  });

  useEffect(() => {
    let cancelado = false;
    chaveDoSite().then(async (chave) => {
      if (!chave || cancelado || !caixa.current) return;
      try {
        await carregarScript();
      } catch {
        return;
      }
      if (cancelado || !caixa.current || !window.turnstile) return;
      widget.current = window.turnstile.render(caixa.current, {
        sitekey: chave,
        theme: tema,
        language: "pt-br",
        callback: (t: string) => {
          setToken(t);
          avisar.current?.(t);
        },
        "expired-callback": () => {
          setToken("");
          avisar.current?.("");
        },
      });
    });
    return () => {
      cancelado = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [tema]);

  // Depois de cada envio o passe já foi usado: pede outro.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      setToken("");
      avisar.current?.("");
    }
  }, [rodada]);

  return (
    <>
      <input type="hidden" name="captcha" value={token} />
      <div ref={caixa} className="empty:hidden" />
    </>
  );
}
