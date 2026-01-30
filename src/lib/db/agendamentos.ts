import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Agendamento } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AGENDAMENTOS_FILE)) {
    fs.writeFileSync(AGENDAMENTOS_FILE, JSON.stringify([]));
  }
}

function readAgendamentos(): Agendamento[] {
  ensureFile();
  try {
    const data = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

function writeAgendamentos(agendamentos: Agendamento[]) {
  ensureFile();
  fs.writeFileSync(AGENDAMENTOS_FILE, JSON.stringify(agendamentos, null, 2));
}

export function getAgendamentos(): Agendamento[] {
  return readAgendamentos().filter(a => a.ativo);
}

export function getAgendamentoById(id: string): Agendamento | null {
  const agendamentos = readAgendamentos();
  return agendamentos.find(a => a.id === id && a.ativo) || null;
}

export function createAgendamento(dados: Omit<Agendamento, 'id' | 'dataCadastro' | 'ativo'>): Agendamento {
  const agendamentos = readAgendamentos();
  const novoAgendamento: Agendamento = {
    ...dados,
    id: uuidv4(),
    dataCadastro: new Date().toISOString(),
    ativo: true
  };
  agendamentos.push(novoAgendamento);
  writeAgendamentos(agendamentos);
  return novoAgendamento;
}

export function updateAgendamento(id: string, dados: Partial<Omit<Agendamento, 'id' | 'dataCadastro'>>): Agendamento | null {
  const agendamentos = readAgendamentos();
  const index = agendamentos.findIndex(a => a.id === id);
  
  if (index === -1) return null;
  
  const agendamento = agendamentos[index];
  const updated: Agendamento = {
    ...agendamento,
    ...dados,
    id: agendamento.id,
    dataCadastro: agendamento.dataCadastro
  };
  
  agendamentos[index] = updated;
  writeAgendamentos(agendamentos);
  return updated;
}

export function deleteAgendamento(id: string): boolean {
  const agendamentos = readAgendamentos();
  const index = agendamentos.findIndex(a => a.id === id);
  
  if (index === -1) return false;
  
  agendamentos[index].ativo = false;
  writeAgendamentos(agendamentos);
  return true;
}

export function buscarAgendamentos(termo: string): Agendamento[] {
  return readAgendamentos().filter(a =>
    a.ativo && (
      a.clienteNome.toLowerCase().includes(termo.toLowerCase()) ||
      a.telefone.includes(termo) ||
      a.aparelhoDescricao?.toLowerCase().includes(termo.toLowerCase()) ||
      a.status.toLowerCase().includes(termo.toLowerCase())
    )
  );
}
