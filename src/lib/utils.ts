import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function checkIsSuperAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  const email = String(usuario.email || '').toLowerCase();

  // Apenas a role explícita 'super_admin' ou o e-mail mestre do criador da plataforma
  const masterEmails = [
    'guiguigamer125@gmail.com',
  ];

  const isMasterEmail = masterEmails.includes(email);
  return role === 'super_admin' || isMasterEmail;
}

export function checkIsStoreAdmin(usuario: any) {
  if (!usuario) return false;
  const role = String(usuario.role || '').toLowerCase();
  return checkIsSuperAdmin(usuario) || role === 'admin' || role === 'gerente';
}

export function checkIsVendedor(usuario: any): boolean {
  if (!usuario) return true;
  if (checkIsStoreAdmin(usuario)) return false;
  const role = String(usuario.role || '').toLowerCase();
  return role === 'vendedor' || role === 'operador' || role === 'atendente';
}

export function canViewFinancials(usuario: any): boolean {
  return checkIsStoreAdmin(usuario);
}

export function getAparelhoCodigo(aparelho: any): string {
  if (!aparelho) return '';
  
  // 1. Se tiver campo código explícito
  if (aparelho.codigo && String(aparelho.codigo).replace(/\D/g, '').length >= 6) {
    const codClean = String(aparelho.codigo).replace(/\D/g, '');
    return codClean.padStart(8, '0');
  }
  if (aparelho.codigoUnico && String(aparelho.codigoUnico).replace(/\D/g, '').length >= 6) {
    const codClean = String(aparelho.codigoUnico).replace(/\D/g, '');
    return codClean.padStart(8, '0');
  }

  // 2. Extrai de observações (ex: "ID: 8665041" ou "ID: 9410244")
  const obs = String(aparelho.observacoes || '');
  const matchObsId = obs.match(/ID:\s*(\d{6,10})/i);
  if (matchObsId) {
    return matchObsId[1].padStart(8, '0');
  }

  // 3. Extrai de numeroSerie se for numérico de 6 a 10 dígitos
  const numSerie = String(aparelho.numeroSerie || '').replace(/\D/g, '');
  if (numSerie.length >= 6 && numSerie.length <= 10) {
    return numSerie.padStart(8, '0');
  }

  // 4. Se o próprio ID do aparelho for numérico de 6 a 10 dígitos
  const idNum = String(aparelho.id || '').replace(/\D/g, '');
  if (idNum.length >= 6 && idNum.length <= 10) {
    return idNum.padStart(8, '0');
  }

  // 5. Gera um código numérico determinístico de 8 dígitos único baseado no ID do aparelho
  let hash = 0;
  const strParaHash = String(aparelho.id || '') + String(aparelho.dataCadastro || '');
  for (let i = 0; i < strParaHash.length; i++) {
    const char = strParaHash.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const hashAbs = Math.abs(hash);
  const id8Digitos = String(10000000 + (hashAbs % 89999999));
  return id8Digitos;
}

/**
 * Converte qualquer string monetária para número decimal de forma segura,
 * evitando problemas de multiplicação por 100 ao remover pontos de decimais.
 * Suporta formatos: "1.750,00", "1750.00", "1750,00", "1,750.00", "1750"
 */
export function parseMonetaryValue(rawVal: any): number {
  if (typeof rawVal === 'number') return isNaN(rawVal) ? 0 : rawVal;
  if (!rawVal) return 0;
  let str = String(rawVal).trim();

  // Remove símbolos de moeda ou espaços
  str = str.replace(/[R$\s]/g, '');

  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Padrão Brasileiro: 1.750,50 -> 1750.50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão Internacional: 1,750.50 -> 1750.50
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Apenas vírgula: 1750,50 -> 1750.50
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Apenas ponto:
    const parts = str.split('.');
    if (parts.length > 2) {
      // Mais de um ponto (ex: 1.750.000)
      str = str.replace(/\./g, '');
    } else if (parts[1] && parts[1].length === 3 && parseFloat(parts[0]) > 0 && !str.includes(',')) {
      // Ex: "1.750" (sem vírgula e exatamente 3 dígitos depois do ponto) -> milhar 1750
      str = str.replace(/\./g, '');
    }
    // Caso seja "1750.00" ou "1750.50" (2 dígitos decimais), mantém o ponto como decimal
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Retorna uma pontuação cronológica crescente do modelo (do mais ANTIGO para o mais NOVO).
 * Quanto menor o número, mais antigo é o modelo (ex: iPhone 7 = 7.1, iPhone 12 = 12.1, iPhone 14 Pro Max = 14.6).
 */
export function getModeloOrdemCronologica(modeloStr: string): number {
  if (!modeloStr) return 9999;
  const mod = modeloStr.toLowerCase().replace(/^apple\s+/i, '').trim();

  // Detecta SE (Edições Especiais)
  if (mod.includes('se 3') || mod.includes('se (3') || mod.includes('se 2022') || mod.includes('se 3ª')) return 12.8;
  if (mod.includes('se 2') || mod.includes('se (2') || mod.includes('se 2020') || mod.includes('se 2ª')) return 10.8;
  if (/\bse\b/i.test(mod)) return 6.5;

  // Detecta geração numérica: 11, 12, 13, 14, 15, 16, 17, 4, 5, 6, 7, 8
  const matchNum = mod.match(/\b(1[1-7]|[4-9])\b/);
  let gen = 0;
  if (matchNum) {
    gen = parseInt(matchNum[1], 10);
  } else if (mod.includes('xs max') || mod.includes('xsmax')) {
    gen = 10.6;
  } else if (mod.includes('xs')) {
    gen = 10.4;
  } else if (mod.includes('xr')) {
    gen = 10.2;
  } else if (/\bx\b/i.test(mod)) {
    gen = 10.0;
  }

  if (gen > 0) {
    let sub = 0.1; // Modelo base (ex: iPhone 14)
    if (mod.includes('mini')) sub = 0.0;
    else if (mod.includes('plus')) sub = 0.2;
    else if (mod.includes('pro max') || mod.includes('promax')) sub = 0.6;
    else if (mod.includes('pro')) sub = 0.4;

    if (Number.isInteger(gen)) {
      return gen + sub;
    }
    return gen;
  }

  // iPads
  if (mod.includes('ipad')) return 200;
  // Apple Watch
  if (mod.includes('watch')) return 300;
  // Mac / MacBook
  if (mod.includes('mac')) return 400;
  // AirPods
  if (mod.includes('airpods') || mod.includes('fone')) return 500;

  return 600;
}

/**
 * Ordena dois modelos alfabeticamente e cronologicamente do MAIS ANTIGO para o MAIS NOVO (Crescente).
 */
export function sortModelosCronologico(modeloA: string, modeloB: string, ordem: 'antigo_para_novo' | 'novo_para_antigo' = 'antigo_para_novo'): number {
  const scoreA = getModeloOrdemCronologica(modeloA);
  const scoreB = getModeloOrdemCronologica(modeloB);

  if (scoreA !== scoreB) {
    return ordem === 'antigo_para_novo' ? scoreA - scoreB : scoreB - scoreA;
  }

  return modeloA.localeCompare(modeloB, 'pt-BR');
}
