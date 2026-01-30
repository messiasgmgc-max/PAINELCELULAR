import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { Tecnico } from './types';

const dataDir = join(process.cwd(), 'data');
const tecnicosPath = join(dataDir, 'tecnicos.json');

// Função auxiliar para ler arquivo
async function lerTecnicos(): Promise<Tecnico[]> {
  try {
    const dados = await fs.readFile(tecnicosPath, 'utf-8');
    return JSON.parse(dados);
  } catch (error) {
    return [];
  }
}

// Função auxiliar para escrever arquivo
async function salvarTecnicos(tecnicos: Tecnico[]): Promise<void> {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(tecnicosPath, JSON.stringify(tecnicos, null, 2));
  } catch (error) {
    throw new Error(`Erro ao salvar técnicos: ${error}`);
  }
}

// Obter todos os técnicos
export async function getTecnicos(): Promise<Tecnico[]> {
  try {
    const tecnicos = await lerTecnicos();
    return tecnicos.filter(t => t.ativo).sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (error) {
    throw new Error(`Erro ao obter técnicos: ${error}`);
  }
}

// Obter técnico por ID
export async function getTecnicoById(id: string): Promise<Tecnico | null> {
  try {
    const tecnicos = await lerTecnicos();
    return tecnicos.find(t => t.id === id) || null;
  } catch (error) {
    throw new Error(`Erro ao obter técnico: ${error}`);
  }
}

// Criar novo técnico
export async function createTecnico(dados: Partial<Tecnico>): Promise<Tecnico> {
  try {
    const tecnicos = await lerTecnicos();

    const novoTecnico: Tecnico = {
      id: uuid(),
      nome: dados.nome || '',
      email: dados.email,
      telefone: dados.telefone || '',
      cpf: dados.cpf,
      especialidade: dados.especialidade,
      dataCadastro: new Date().toISOString(),
      ativo: true
    };

    tecnicos.push(novoTecnico);
    await salvarTecnicos(tecnicos);
    
    return novoTecnico;
  } catch (error) {
    throw new Error(`Erro ao criar técnico: ${error}`);
  }
}

// Atualizar técnico
export async function updateTecnico(id: string, dados: Partial<Tecnico>): Promise<Tecnico | null> {
  try {
    const tecnicos = await lerTecnicos();
    const index = tecnicos.findIndex(t => t.id === id);
    
    if (index === -1) return null;

    const tecnicoAtualizado: Tecnico = {
      ...tecnicos[index],
      ...dados,
      id, // Garantir que o ID não mude
      dataCadastro: tecnicos[index].dataCadastro // Manter data original
    };

    tecnicos[index] = tecnicoAtualizado;
    await salvarTecnicos(tecnicos);
    
    return tecnicoAtualizado;
  } catch (error) {
    throw new Error(`Erro ao atualizar técnico: ${error}`);
  }
}

// Deletar técnico
export async function deleteTecnico(id: string): Promise<boolean> {
  try {
    const tecnicos = await lerTecnicos();
    const index = tecnicos.findIndex(t => t.id === id);
    
    if (index === -1) return false;

    tecnicos[index].ativo = false;
    await salvarTecnicos(tecnicos);
    
    return true;
  } catch (error) {
    throw new Error(`Erro ao deletar técnico: ${error}`);
  }
}

// Buscar técnicos por termo
export async function buscarTecnicos(termo: string): Promise<Tecnico[]> {
  try {
    const tecnicos = await lerTecnicos();
    const termoLower = termo.toLowerCase();
    
    return tecnicos.filter(t => 
      t.ativo && (
        t.nome.toLowerCase().includes(termoLower) ||
        t.email?.toLowerCase().includes(termoLower) ||
        t.telefone.includes(termoLower) ||
        t.especialidade?.toLowerCase().includes(termoLower)
      )
    ).sort((a, b) => a.nome.localeCompare(b.nome));
  } catch (error) {
    throw new Error(`Erro ao buscar técnicos: ${error}`);
  }
}
