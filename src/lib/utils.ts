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
