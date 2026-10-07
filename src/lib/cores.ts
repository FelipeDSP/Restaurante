import type { CSSProperties } from "react";

function luminancia(hex: string): number {
  const valor = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(valor.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste WCAG entre duas cores #rrggbb (1 a 21).
export function razaoContraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

// Texto legível (preto ou branco) sobre uma cor de fundo #rrggbb: o de maior contraste.
// (Um limite fixo de luminância deixava laranja, verde e azul médios com texto branco a 2,5–2,9:1.)
export function corDeContraste(hex: string): "#ffffff" | "#111111" {
  return razaoContraste(hex, "#ffffff") >= razaoContraste(hex, "#111111") ? "#ffffff" : "#111111";
}

// Versão da cor para usar como texto, borda de foco ou interruptor sobre fundo branco:
// escurece aos poucos até ter contraste 4,5:1 (um amarelo #FFE14D vira um mostarda legível).
export function corParaTexto(hex: string): string {
  const valor = hex.replace("#", "");
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(valor.slice(i, i + 2), 16));
  for (let passo = 0; passo < 40 && razaoContraste(paraHex(r, g, b), "#ffffff") < 4.5; passo++) {
    [r, g, b] = [r, g, b].map((c) => Math.max(0, Math.floor(c * 0.92)));
  }
  return paraHex(r, g, b);
}

function paraHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Variáveis CSS da marca do restaurante. A cor primária também vira a `--primary` do shadcn,
// então botões e destaques seguem a marca automaticamente.
export function estiloMarca(cores: { corPrimaria: string; corSecundaria: string }): CSSProperties {
  const contrastePrimaria = corDeContraste(cores.corPrimaria);
  return {
    "--cor-primaria": cores.corPrimaria,
    "--cor-secundaria": cores.corSecundaria,
    "--cor-primaria-contraste": contrastePrimaria,
    "--cor-secundaria-contraste": corDeContraste(cores.corSecundaria),
    "--cor-primaria-texto": corParaTexto(cores.corPrimaria),
    "--primary": cores.corPrimaria,
    "--primary-foreground": contrastePrimaria,
    "--ring": corParaTexto(cores.corPrimaria),
  } as CSSProperties;
}
