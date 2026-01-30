import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Garantia } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const GARANTIAS_FILE = path.join(DATA_DIR, 'garantias.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(GARANTIAS_FILE)) {
    fs.writeFileSync(GARANTIAS_FILE, JSON.stringify([]));
  }
}

function readGarantias(): Garantia[] {
  ensureFile();
  try {
    const data = fs.readFileSync(GARANTIAS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

function writeGarantias(garantias: Garantia[]) {
  ensureFile();
  fs.writeFileSync(GARANTIAS_FILE, JSON.stringify(garantias, null, 2));
}

export function getGarantias(): Garantia[] {
  return readGarantias().filter(g => g.ativo);
}

export function getGarantiaById(id: string): Garantia | null {
  const garantias = readGarantias();
  return garantias.find(g => g.id === id && g.ativo) || null;
}

export function getGarantiasByOsId(osId: string): Garantia | null {
  const garantias = readGarantias();
  return garantias.find(g => g.osId === osId && g.ativo) || null;
}

export function createGarantia(dados: Omit<Garantia, 'id' | 'dataCadastro'>): Garantia {
  const garantias = readGarantias();
  const novaGarantia: Garantia = {
    ...dados,
    id: uuidv4(),
    dataCadastro: new Date().toISOString()
  };
  garantias.push(novaGarantia);
  writeGarantias(garantias);
  return novaGarantia;
}

export function updateGarantia(id: string, dados: Partial<Omit<Garantia, 'id' | 'dataCadastro'>>): Garantia | null {
  const garantias = readGarantias();
  const index = garantias.findIndex(g => g.id === id);
  
  if (index === -1) return null;
  
  const garantia = garantias[index];
  const updated: Garantia = {
    ...garantia,
    ...dados,
    id: garantia.id,
    dataCadastro: garantia.dataCadastro
  };
  
  garantias[index] = updated;
  writeGarantias(garantias);
  return updated;
}

export function deleteGarantia(id: string): boolean {
  const garantias = readGarantias();
  const index = garantias.findIndex(g => g.id === id);
  
  if (index === -1) return false;
  
  garantias[index].ativo = false;
  writeGarantias(garantias);
  return true;
}

export function buscarGarantias(termo: string): Garantia[] {
  return readGarantias().filter(g =>
    g.ativo && (
      g.clienteNome.toLowerCase().includes(termo.toLowerCase()) ||
      g.aparelhoDescricao.toLowerCase().includes(termo.toLowerCase()) ||
      g.osNumero.toString().includes(termo)
    )
  );
}

export function isGarantiaVigente(garantia: Garantia): boolean {
  const dataFim = new Date(garantia.dataInicio);
  dataFim.setDate(dataFim.getDate() + garantia.diasGarantia);
  return new Date() < dataFim;
}

export function getDiasRestantes(garantia: Garantia): number {
  const dataFim = new Date(garantia.dataInicio);
  dataFim.setDate(dataFim.getDate() + garantia.diasGarantia);
  const difMs = dataFim.getTime() - new Date().getTime();
  return Math.ceil(difMs / (1000 * 60 * 60 * 24));
}
