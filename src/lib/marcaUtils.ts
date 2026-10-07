/**
 * Identifica e normaliza de forma inteligente a marca e fabricante de um aparelho
 * com base no nome do modelo e contexto.
 * Reconhece automaticamente linhas como Poco, Redmi, Galaxy, Moto, etc.
 */
export function inferirMarcaPorModelo(modelo?: string | null, marcaInformada?: string | null): string {
  const mi = (marcaInformada || '').trim().toLowerCase();
  const m = (modelo || '').trim().toLowerCase();

  // Se já informou uma marca válida diferente de "outro", "outros", "celular", "aparelho"
  const marcasGenericas = ['outro', 'outros', 'celular', 'aparelho', 'smartphone', 'indefinido'];
  if (mi && !marcasGenericas.includes(mi)) {
    // Se foi marcada como 'apple', mas o modelo claramente é de outra fabricante (Poco, Redmi, Samsung, etc.), corrige!
    const eClaramenteNaoApple =
      mi === 'apple' &&
      (m.includes('poco') ||
        m.includes('redmi') ||
        m.includes('xiaomi') ||
        m.includes('galaxy') ||
        m.includes('samsung') ||
        m.includes('motorola') ||
        m.includes('moto ') ||
        m.includes('realme') ||
        m.includes('infinix'));

    if (!eClaramenteNaoApple) {
      // Normaliza capitalização
      return mi.charAt(0).toUpperCase() + mi.slice(1);
    }
  }

  if (!m) return 'Apple';

  // Xiaomi / Poco / Redmi / Black Shark
  if (
    m.includes('poco') ||
    m.includes('redmi') ||
    m.includes('xiaomi') ||
    m.includes('black shark') ||
    /\bmi\s*(?:\d|note|max|mix|pad)/i.test(m)
  ) {
    return 'Xiaomi';
  }

  // Samsung
  if (
    m.includes('galaxy') ||
    m.includes('samsung') ||
    m.includes('z fold') ||
    m.includes('z flip') ||
    /\b(?:s\d{1,2}|a\d{1,2}|m\d{1,2}|note\s*\d{1,2}|fold\d?|flip\d?)\b/i.test(m) &&
      !m.includes('iphone') &&
      !m.includes('ipad')
  ) {
    return 'Samsung';
  }

  // Motorola
  if (
    m.includes('motorola') ||
    m.includes('moto ') ||
    m.includes('edge ') ||
    m.includes('motog') ||
    m.includes('moto e') ||
    m.includes('razr')
  ) {
    return 'Motorola';
  }

  // Realme
  if (m.includes('realme') || m.includes('narzo')) {
    return 'Realme';
  }

  // Google Pixel
  if (m.includes('pixel') || m.includes('google')) {
    return 'Google';
  }

  // Infinix
  if (m.includes('infinix') || m.includes('hot ') || m.includes('note 30') || m.includes('zero ')) {
    return 'Infinix';
  }

  // ASUS / ROG
  if (m.includes('asus') || m.includes('zenfone') || m.includes('rog phone')) {
    return 'Asus';
  }

  // LG
  if (m.includes('lg ') || m.includes('k51') || m.includes('k61') || m.includes('velvet')) {
    return 'LG';
  }

  // Apple
  if (
    m.includes('iphone') ||
    m.includes('ipad') ||
    m.includes('apple') ||
    m.includes('macbook') ||
    m.includes('airpods') ||
    m.includes('watch') ||
    /\b(1[1-9]|[4-9])\s*(?:pro\s*max|pro|plus|max|mini)?\b/i.test(m)
  ) {
    return 'Apple';
  }

  // Fallback padrão se não detectado
  return 'Apple';
}
