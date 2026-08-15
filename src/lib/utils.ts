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
  return id8Digitos;
}

