import {
  interpretarIdentificador,
  normalizarCapacidade,
  normalizarMarca,
  normalizarModelo,
  procurarDuplicado,
  type AparelhoBase,
} from '../pdv/cadastroRapido';

/**
 * Regras do formulário "Cadastrar Novo Produto" do estoque.
 *
 * O formulário antigo só conferia marca e modelo: aceitava IMEI com dígito
 * verificador errado ou incompleto, deixava cadastrar o mesmo IMEI duas vezes no
 * estoque e, se o banco recusasse uma coluna, o hook tirava a coluna e gravava sem
 * ela em silêncio. Aqui fica a validação e a tradução do erro do banco.
 */

export type CategoriaProduto = 'aparelho' | 'perfume' | 'acessorio' | 'outro';

export interface EntradaCadastroManual {
  categoria: CategoriaProduto;
  marca: string;
  modelo: string;
  imei: string;
  numeroSerie: string;
  capacidade: string;
  cor: string;
}

export interface DadosCadastroManual {
  marca: string;
  modelo: string;
  imei: string | null;
  numeroSerie: string | null;
  capacidade: string | null;
  cor: string | null;
}

export type ValidacaoCadastroManual =
  | { ok: true; dados: DadosCadastroManual }
  | { ok: false; campo: 'marca' | 'modelo' | 'imei'; erro: string };

export interface ContextoCadastroManual {
  /** Aparelhos da loja já carregados na tela (a checagem no banco vem depois). */
  aparelhos: AparelhoBase[];
  /** Id do aparelho em edição: ele mesmo não conta como duplicado. */
  editandoId?: string | null;
  /** IMEI gravado antes da edição. Sem mudança, não é revalidado (importações antigas guardam só 4 dígitos). */
  imeiOriginal?: string | null;
}

/** Texto limpo ou null. 'N/A' e vazio nunca vão para o banco. */
function textoOuNulo(valor: unknown): string | null {
  const texto = String(valor ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return texto && !/^n\/?a$/i.test(texto) ? texto : null;
}

export function mensagemImeiDuplicado(aparelho: AparelhoBase, emManutencao = false): string {
  const descricao = [aparelho.marca, aparelho.modelo, aparelho.capacidade].filter(Boolean).join(' ');
  const codigo = aparelho.codigo ? ` (código ${aparelho.codigo})` : '';
  return (
    `Este IMEI já está ${emManutencao ? 'em manutenção' : 'no estoque'}: ${descricao || 'aparelho sem modelo'}${codigo}. ` +
    'Procure o aparelho na lista em vez de cadastrar de novo.'
  );
}

export function validarCadastroManual(
  entrada: EntradaCadastroManual,
  contexto: ContextoCadastroManual
): ValidacaoCadastroManual {
  const ehAparelho = entrada.categoria === 'aparelho';
  const marca = ehAparelho ? normalizarMarca(entrada.marca) : textoOuNulo(entrada.marca) || '';
  const modelo = ehAparelho ? normalizarModelo(entrada.modelo) : textoOuNulo(entrada.modelo) || '';
  if (!marca) return { ok: false, campo: 'marca', erro: 'Preencha a marca.' };
  if (!modelo) return { ok: false, campo: 'modelo', erro: 'Preencha o modelo / nome do produto.' };

  let imei = textoOuNulo(entrada.imei);
  const imeiMudou = !contexto.editandoId || imei !== textoOuNulo(contexto.imeiOriginal);

  if (imei && imeiMudou) {
    const leitura = interpretarIdentificador(imei);
    if (leitura.tipo === 'imei' && !leitura.completado) {
      imei = leitura.imei;
    } else if (leitura.tipo === 'imei_invalido') {
      return {
        ok: false,
        campo: 'imei',
        erro: 'IMEI inválido: o dígito verificador não confere. Confira o número na caixa ou discando *#06#.',
      };
    } else if (leitura.tipo === 'incompleto' || (leitura.tipo === 'imei' && leitura.completado)) {
      // 14 dígitos não são completados aqui: num formulário digitado, o mais comum é um dígito esquecido.
      const digitos = imei.replace(/\D/g, '').length;
      return {
        ok: false,
        campo: 'imei',
        erro: `IMEI incompleto: ${digitos} de 15 dígitos. Deixe em branco se ainda não tem o IMEI.`,
      };
    } else {
      return {
        ok: false,
        campo: 'imei',
        erro: 'O IMEI tem 15 dígitos. Número de série vai no campo "Número de Série".',
      };
    }

    const outros = contexto.aparelhos.filter((a) => a.id !== contexto.editandoId);
    const duplicado = procurarDuplicado({ imei }, outros);
    if (duplicado.tipo === 'em_estoque' || duplicado.tipo === 'manutencao') {
      return {
        ok: false,
        campo: 'imei',
        erro: mensagemImeiDuplicado(duplicado.aparelho, duplicado.tipo === 'manutencao'),
      };
    }
  }

  return {
    ok: true,
    dados: {
      marca,
      modelo,
      imei,
      numeroSerie: textoOuNulo(entrada.numeroSerie),
      capacidade: ehAparelho ? normalizarCapacidade(entrada.capacidade) : textoOuNulo(entrada.capacidade),
      cor: textoOuNulo(entrada.cor),
    },
  };
}

export interface ErroGravacaoAparelho {
  message?: string | null;
  code?: string | null;
  details?: string | null;
}

/** Mensagem que a pessoa lê quando o banco recusa o cadastro ou a edição. */
export function mensagemErroGravacaoAparelho(erro: ErroGravacaoAparelho | null | undefined): string {
  if (!erro) return 'Não foi possível salvar o aparelho.';
  const texto = `${erro.message || ''} ${erro.details || ''}`;
  if (erro.code === '23505' && /uq_aparelhos_imei_completo_no_estoque/.test(texto)) {
    return 'Já existe um aparelho com este IMEI no estoque desta loja. Procure pelo IMEI na lista antes de cadastrar de novo.';
  }
  if (erro.code === '23505') {
    return `O banco recusou um registro duplicado: ${erro.message || 'valor já cadastrado'}.`;
  }
  return erro.message ? `Não foi possível salvar o aparelho: ${erro.message}` : 'Não foi possível salvar o aparelho.';
}
