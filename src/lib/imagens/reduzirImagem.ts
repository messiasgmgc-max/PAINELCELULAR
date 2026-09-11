/**
 * Reduz uma foto no navegador antes de enviar para o servidor: foto de celular tem
 * 3–8 MB e subiria devagar no 4G. Com 1600 px no lado maior os dígitos do IMEI
 * continuam legíveis para a IA e o JPEG fica por volta de 300–600 KB.
 */
export async function reduzirImagemParaEnvio(arquivo: Blob, ladoMaximo = 1600, qualidade = 0.85): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = await new Promise<HTMLImageElement>((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rejeitar(new Error('Não foi possível abrir a imagem.'));
      img.src = url;
    });

    const escala = Math.min(1, ladoMaximo / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Não foi possível preparar a imagem.');
    // Fundo branco: PNG transparente (print) não vira preto no JPEG.
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}
