import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Cliente } from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const CLIENTS_FILE = path.join(DB_DIR, "clientes.json");

// Garante que o diretório data existe
async function ensureDbDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch (error) {
    // Diretório já existe
  }
}

// Lê todos os clientes
export async function getClientes(): Promise<Cliente[]> {
  try {
    await ensureDbDir();
    const data = await fs.readFile(CLIENTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Arquivo não existe ou erro ao ler, retorna array vazio
    return [];
  }
}

// Lê um cliente por ID
export async function getClienteById(id: string): Promise<Cliente | null> {
  const clientes = await getClientes();
  return clientes.find((c) => c.id === id) || null;
}

// Cria novo cliente
export async function createCliente(
  dados: Omit<Cliente, "id" | "dataCadastro">
): Promise<Cliente> {
  const clientes = await getClientes();

  const novoCliente: Cliente = {
    ...dados,
    id: uuidv4(),
    dataCadastro: new Date().toISOString(),
  };

  clientes.push(novoCliente);
  await fs.writeFile(CLIENTS_FILE, JSON.stringify(clientes, null, 2));

  return novoCliente;
}

// Atualiza cliente
export async function updateCliente(
  id: string,
  dados: Partial<Omit<Cliente, "id" | "dataCadastro">>
): Promise<Cliente | null> {
  const clientes = await getClientes();
  const index = clientes.findIndex((c) => c.id === id);

  if (index === -1) return null;

  clientes[index] = {
    ...clientes[index],
    ...dados,
  };

  await fs.writeFile(CLIENTS_FILE, JSON.stringify(clientes, null, 2));
  return clientes[index];
}

// Deleta cliente
export async function deleteCliente(id: string): Promise<boolean> {
  const clientes = await getClientes();
  const filtrado = clientes.filter((c) => c.id !== id);

  if (filtrado.length === clientes.length) return false; // Não encontrou

  await fs.writeFile(CLIENTS_FILE, JSON.stringify(filtrado, null, 2));
  return true;
}

// Busca clientes por nome
export async function buscarClientes(termo: string): Promise<Cliente[]> {
  const clientes = await getClientes();
  const termoLower = termo.toLowerCase();

  return clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(termoLower) ||
      c.email.toLowerCase().includes(termoLower) ||
      c.telefone.includes(termo)
  );
}
