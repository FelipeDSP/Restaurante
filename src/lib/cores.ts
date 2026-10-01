import type { CSSProperties } from "react";

// Texto legível (preto ou branco) sobre uma cor de fundo #rrggbb.
export function corDeContraste(hex: string): "#ffffff" | "#111111" {
  const valor = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(valor.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.4 ? "#111111" : "#ffffff";
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
    "--primary": cores.corPrimaria,
    "--primary-foreground": contrastePrimaria,
    "--ring": cores.corPrimaria,
  } as CSSProperties;
}
