import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Peca } from "./types";

const dataDir = path.join(process.cwd(), "data");
const pecasFilePath = path.join(dataDir, "pecas.json");

// Função auxiliar para garantir que o arquivo existe
async function ensureFile() {
  try {
    await fs.access(pecasFilePath);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(pecasFilePath, JSON.stringify([]));
  }
}

// Ler todas as peças
export async function getPecas(): Promise<Peca[]> {
  try {
    await ensureFile();
    const data = await fs.readFile(pecasFilePath, "utf-8");
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

// Buscar peça por ID
export async function getPecaById(id: string): Promise<Peca | null> {
  const pecas = await getPecas();
  return pecas.find((peca) => peca.id === id) || null;
}

// Criar nova peça
export async function createPeca(dados: Omit<Peca, "id" | "dataCadastro">): Promise<Peca> {
  const pecas = await getPecas();

  // Calcular margem se não for fornecida
  const margem =
    dados.margem !== undefined
      ? dados.margem
      : ((dados.vendaPeca - dados.custoPeca) / dados.custoPeca) * 100;

  const novaPeca: Peca = {
    ...dados,
    id: uuidv4(),
    margem: Math.round(margem * 100) / 100,
    dataCadastro: new Date().toISOString(),
  };

  pecas.push(novaPeca);
  await fs.writeFile(pecasFilePath, JSON.stringify(pecas, null, 2));

  return novaPeca;
}

// Atualizar peça
export async function updatePeca(
  id: string,
  dados: Partial<Omit<Peca, "id" | "dataCadastro">>
): Promise<Peca | null> {
  const pecas = await getPecas();
  const index = pecas.findIndex((peca) => peca.id === id);

  if (index === -1) {
    return null;
  }

  // Recalcular margem se mudar custo ou venda
  let margem = pecas[index].margem || 0;
  if (dados.custoPeca !== undefined || dados.vendaPeca !== undefined) {
    const custo = dados.custoPeca ?? pecas[index].custoPeca;
    const venda = dados.vendaPeca ?? pecas[index].vendaPeca;
    margem = ((venda - custo) / custo) * 100;
  }

  const pecaAtualizada: Peca = {
    ...pecas[index],
    ...dados,
    margem: Math.round(margem * 100) / 100,
  };

  pecas[index] = pecaAtualizada;
  await fs.writeFile(pecasFilePath, JSON.stringify(pecas, null, 2));

  return pecaAtualizada;
}

// Deletar peça
export async function deletePeca(id: string): Promise<boolean> {
  const pecas = await getPecas();
  const pecasFiltradas = pecas.filter((peca) => peca.id !== id);

  if (pecasFiltradas.length === pecas.length) {
    return false; // Peça não encontrada
  }

  await fs.writeFile(pecasFilePath, JSON.stringify(pecasFiltradas, null, 2));
  return true;
}

// Buscar peças por termo (nome, código, fornecedor)
export async function buscarPecas(termo: string): Promise<Peca[]> {
  const pecas = await getPecas();
  const termoLower = termo.toLowerCase();

  return pecas.filter(
    (peca) =>
      peca.nome.toLowerCase().includes(termoLower) ||
      peca.codigoUnico.toLowerCase().includes(termoLower) ||
      peca.fornecedor?.toLowerCase().includes(termoLower) ||
      peca.descricao?.toLowerCase().includes(termoLower)
  );
}

// Atualizar estoque (entrada/saída)
export async function atualizarEstoque(
  id: string,
  quantidade: number,
  tipo: "entrada" | "saida"
): Promise<Peca | null> {
  const pecas = await getPecas();
  const index = pecas.findIndex((peca) => peca.id === id);

  if (index === -1) {
    return null;
  }

  const novoEstoque =
    tipo === "entrada"
      ? pecas[index].estoque + quantidade
      : pecas[index].estoque - quantidade;

  if (novoEstoque < 0) {
    return null; // Não pode ter estoque negativo
  }

  pecas[index].estoque = novoEstoque;
  await fs.writeFile(pecasFilePath, JSON.stringify(pecas, null, 2));

  return pecas[index];
}
