// Reduz a imagem no navegador antes do upload (fotos de celular chegam a 10 MB).
export async function redimensionarImagem(arquivo: File, ladoMaximo: number): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Navegador sem suporte a canvas.");
  contexto.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao converter a imagem."))),
      "image/webp",
      0.85,
    );
  });
}
