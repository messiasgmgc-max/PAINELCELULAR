import { promises as fs } from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { Aparelho } from "./types";

const DB_DIR = path.join(process.cwd(), "data");
const APARELHOS_FILE = path.join(DB_DIR, "aparelhos.json");

// Garante que o diretório data existe
async function ensureDbDir() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
  } catch (error) {
    // Diretório já existe
  }
}

// Lê todos os aparelhos
export async function getAparelhos(): Promise<Aparelho[]> {
  try {
    await ensureDbDir();
    const data = await fs.readFile(APARELHOS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Arquivo não existe ou erro ao ler, retorna array vazio
    return [];
  }
}

// Lê um aparelho por ID
export async function getAparelhoById(id: string): Promise<Aparelho | null> {
  const aparelhos = await getAparelhos();
  return aparelhos.find((a) => a.id === id) || null;
}

// Cria novo aparelho
export async function createAparelho(
  dados: Omit<Aparelho, "id" | "dataCadastro">
): Promise<Aparelho> {
  const aparelhos = await getAparelhos();

  const novoAparelho: Aparelho = {
    ...dados,
    id: uuidv4(),
    dataCadastro: new Date().toISOString(),
  };

  aparelhos.push(novoAparelho);
  await fs.writeFile(APARELHOS_FILE, JSON.stringify(aparelhos, null, 2));

  return novoAparelho;
}

// Atualiza aparelho
export async function updateAparelho(
  id: string,
  dados: Partial<Omit<Aparelho, "id" | "dataCadastro">>
): Promise<Aparelho | null> {
  const aparelhos = await getAparelhos();
  const index = aparelhos.findIndex((a) => a.id === id);

  if (index === -1) return null;

  aparelhos[index] = {
    ...aparelhos[index],
    ...dados,
  };

  await fs.writeFile(APARELHOS_FILE, JSON.stringify(aparelhos, null, 2));
  return aparelhos[index];
}

// Deleta aparelho
export async function deleteAparelho(id: string): Promise<boolean> {
  const aparelhos = await getAparelhos();
  const filtrado = aparelhos.filter((a) => a.id !== id);

  if (filtrado.length === aparelhos.length) return false; // Não encontrou

  await fs.writeFile(APARELHOS_FILE, JSON.stringify(filtrado, null, 2));
  return true;
}

// Busca aparelhos por modelo ou marca
export async function buscarAparelhos(termo: string): Promise<Aparelho[]> {
  const aparelhos = await getAparelhos();
  const termoLower = termo.toLowerCase();

  return aparelhos.filter(
    (a) =>
      a.modelo.toLowerCase().includes(termoLower) ||
      a.marca.toLowerCase().includes(termoLower) ||
      a.imei?.includes(termo) ||
      a.numeroSerie?.includes(termo) ||
      a.cliente?.toLowerCase().includes(termoLower)
  );
}
