import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import bcryptjs from 'bcryptjs';
import { Usuario, SessaoUsuario } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const USUARIOS_FILE = path.join(DATA_DIR, 'usuarios.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USUARIOS_FILE)) {
    // Criar usuário admin padrão
    const senhaHash = bcryptjs.hashSync('admin123', 10);
    const usuarios: Usuario[] = [
      {
        id: uuidv4(),
        email: 'admin@phonecenter.com',
        senha: senhaHash,
        nome: 'Administrador',
        role: 'admin',
        ativo: true,
        dataCadastro: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
  }
}

function readUsuarios(): Usuario[] {
  ensureFile();
  try {
    const data = fs.readFileSync(USUARIOS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch {
    return [];
  }
}

function writeUsuarios(usuarios: Usuario[]) {
  ensureFile();
  fs.writeFileSync(USUARIOS_FILE, JSON.stringify(usuarios, null, 2));
}

export function getUsuarios(): Usuario[] {
  return readUsuarios().filter(u => u.ativo);
}

export function getUsuarioById(id: string): Usuario | null {
  const usuarios = readUsuarios();
  return usuarios.find(u => u.id === id && u.ativo) || null;
}

export function getUsuarioByEmail(email: string): Usuario | null {
  const usuarios = readUsuarios();
  return usuarios.find(u => u.email === email.toLowerCase() && u.ativo) || null;
}

export async function validarSenha(email: string, senha: string): Promise<SessaoUsuario | null> {
  const usuario = getUsuarioByEmail(email);
  if (!usuario) return null;

  const senhaValida = await bcryptjs.compare(senha, usuario.senha);
  if (!senhaValida) return null;

  // Atualizar último acesso
  const usuarios = readUsuarios();
  const index = usuarios.findIndex(u => u.id === usuario.id);
  if (index !== -1) {
    usuarios[index].ultimoAcesso = new Date().toISOString();
    writeUsuarios(usuarios);
  }

  return {
    id: usuario.id,
    email: usuario.email,
    nome: usuario.nome,
    role: usuario.role
  };
}

export async function criarUsuario(
  email: string,
  senha: string,
  nome: string,
  role: Usuario['role'] = 'operador'
): Promise<Usuario | null> {
  const usuarios = readUsuarios();

  // Verificar se email já existe
  if (usuarios.some(u => u.email === email.toLowerCase())) {
    return null;
  }

  const senhaHash = await bcryptjs.hash(senha, 10);
  const novoUsuario: Usuario = {
    id: uuidv4(),
    email: email.toLowerCase(),
    senha: senhaHash,
    nome,
    role,
    ativo: true,
    dataCadastro: new Date().toISOString()
  };

  usuarios.push(novoUsuario);
  writeUsuarios(usuarios);

  // Retornar sem a senha
  const { senha: _, ...usuarioSemSenha } = novoUsuario;
  return { ...usuarioSemSenha, senha: '' };
}

export async function atualizarUsuario(
  id: string,
  dados: Partial<Omit<Usuario, 'id' | 'dataCadastro' | 'senha'>> & { novaSenha?: string }
): Promise<Usuario | null> {
  const usuarios = readUsuarios();
  const index = usuarios.findIndex(u => u.id === id);

  if (index === -1) return null;

  const usuario = usuarios[index];
  const atualizado: Usuario = {
    ...usuario,
    ...dados,
    id: usuario.id,
    dataCadastro: usuario.dataCadastro
  };

  if (dados.novaSenha) {
    atualizado.senha = await bcryptjs.hash(dados.novaSenha, 10);
  }

  usuarios[index] = atualizado;
  writeUsuarios(usuarios);

  const { senha: _, ...usuarioSemSenha } = atualizado;
  return { ...usuarioSemSenha, senha: '' };
}

export function deleteUsuario(id: string): boolean {
  const usuarios = readUsuarios();
  const index = usuarios.findIndex(u => u.id === id);

  if (index === -1) return false;

  usuarios[index].ativo = false;
  writeUsuarios(usuarios);
  return true;
}
