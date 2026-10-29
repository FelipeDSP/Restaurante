"use client";

import { useEffect } from "react";

// Comportamentos da landing (mesmos da versão do Bitrix): topo com sombra ao rolar, seções que
// aparecem ao descer, avisos que se revezam no herói e a demonstração do "Chamar garçom".
const AVISOS: [string, string][] = [
  ["MESA 07 · 21:14", "Pediu pelo celular"],
  ["CAIXA CHAMANDO", "Vir ao caixa"],
  ["DELIVERY #214", "Saiu para entrega"],
  ["MESA 05 · 2 PESSOAS", "Comanda aberta"],
];

export function EfeitosLanding() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".lp");
    if (!raiz) return;
    const limpar: (() => void)[] = [];

    const nav = raiz.querySelector(".nav");
    const aoRolar = () => nav?.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", aoRolar, { passive: true });
    aoRolar();
    limpar.push(() => window.removeEventListener("scroll", aoRolar));

    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Revela ao rolar: só esconde o que ainda está abaixo da dobra.
    if (!reduzir && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entradas) => {
          for (const e of entradas) {
            if (!e.isIntersecting) continue;
            const el = e.target as HTMLElement;
            const irmaos = [...(el.parentElement?.children ?? [])].filter((s) => s.classList.contains("reveal"));
            el.style.transitionDelay = `${Math.min(irmaos.indexOf(el), 5) * 70}ms`;
            el.classList.remove("pre");
            io.unobserve(el);
          }
        },
        { rootMargin: "0px 0px -8% 0px" },
      );
      raiz.querySelectorAll<HTMLElement>(".reveal").forEach((el) => {
        if (el.getBoundingClientRect().top > window.innerHeight * 0.92) {
          el.classList.add("pre");
          io.observe(el);
        }
      });
      limpar.push(() => io.disconnect());
    }

    // Avisos que se revezam no herói.
    const toast = raiz.querySelector("#toast");
    const k = raiz.querySelector("#toast-k");
    const t = raiz.querySelector("#toast-t");
    if (!reduzir && toast && k && t) {
      let i = 0;
      const intervalo = window.setInterval(() => {
        toast.classList.add("out");
        window.setTimeout(() => {
          i = (i + 1) % AVISOS.length;
          k.textContent = AVISOS[i][0];
          t.textContent = AVISOS[i][1];
          toast.classList.remove("out");
        }, 380);
      }, 3200);
      limpar.push(() => window.clearInterval(intervalo));
    }

    // Demonstração do "Chamar garçom".
    const chips = [...raiz.querySelectorAll<HTMLButtonElement>(".chip")];
    const notif = raiz.querySelector<HTMLElement>("#notif");
    const nt = raiz.querySelector("#notif-t");
    for (const chip of chips) {
      const aoTocar = () => {
        chips.forEach((o) => o.setAttribute("aria-pressed", o === chip ? "true" : "false"));
        if (nt) nt.textContent = chip.dataset.t ?? "";
        if (notif) {
          notif.classList.remove("ping");
          void notif.offsetWidth;
          notif.classList.add("ping");
        }
      };
      chip.addEventListener("click", aoTocar);
      limpar.push(() => chip.removeEventListener("click", aoTocar));
    }

    return () => limpar.forEach((f) => f());
  }, []);

  return null;
}
