import { Aparelho } from '@/lib/db/types';
import { getAparelhoCodigo } from '@/lib/utils';

// Mapeamento de sinônimos de cores (PT/EN e variantes comerciais da Apple/Samsung)
const SINONIMOS_CORES: Record<string, string[]> = {
  azul: ['blue', 'pacific blue', 'sierra blue', 'titanio azul', 'blue titanium', 'sky blue', 'marinho'],
  blue: ['azul', 'pacific blue', 'sierra blue', 'titanio azul', 'blue titanium'],
  preto: ['black', 'space black', 'grafite', 'graphite', 'noite', 'midnight', 'dark', 'preta', 'jet black'],
  black: ['preto', 'space black', 'grafite', 'graphite', 'noite', 'midnight', 'dark', 'preta'],
  branco: ['white', 'starlight', 'estelar', 'silver', 'prata', 'branca'],
  white: ['branco', 'starlight', 'estelar', 'silver', 'prata', 'branca'],
  prata: ['silver', 'white', 'branco', 'estelar'],
  silver: ['prata', 'white', 'branco', 'estelar'],
  dourado: ['gold', 'dourada'],
  gold: ['dourado', 'dourada'],
  roxo: ['purple', 'deep purple', 'violeta', 'roxa'],
  purple: ['roxo', 'deep purple', 'violeta', 'roxa'],
  verde: ['green', 'alpine green', 'verdes'],
  green: ['verde', 'alpine green'],
  rosa: ['pink', 'rose', 'rose gold'],
  pink: ['rosa', 'rose', 'rose gold'],
  natural: ['titanio natural', 'natural titanium', 'titanio'],
  cinza: ['gray', 'grey', 'space gray', 'space grey'],
  gray: ['cinza', 'grey', 'space gray'],
  grey: ['cinza', 'gray', 'space grey'],
};

// Expansão de atalhos comuns de busca (ex: 15pm -> 15 pro max, 15p -> 15 pro)
function expandirAtalhosBusca(termo: string): string {
  let t = termo.toLowerCase().trim();
  
  // Substitui atalhos como 15pm, 15p, 14pm, 14p, 13pm, 13p, 12pm, 12p, 11pm, 11p, 13m
  t = t.replace(/\b(\d{1,2})pm\b/g, '$1 pro max');
  t = t.replace(/\b(\d{1,2})p\b/g, '$1 pro');
  t = t.replace(/\b(\d{1,2})m\b/g, '$1 mini');
  t = t.replace(/\b(\d{1,2})plus\b/g, '$1 plus');
  t = t.replace(/\bpromax\b/g, 'pro max');
  
  return t;
}

export function normalizarTexto(txt: string): string {
  if (!txt) return '';
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .trim();
}

export interface ResultadoBuscaAparelho {
  aparelho: Aparelho;
  score: number;
}

/**
 * Filtra e ordena uma lista de aparelhos com busca inteligente por palavras (AND),
 * suporte a cor, bateria, IMEI/código, aliases (15p, 15pm) e diferenciação estrita de modelos (15 Pro vs 15 Pro Max).
 */
export function filtrarESortearAparelhos(
  aparelhos: Aparelho[],
  searchTerm: string
): Aparelho[] {
  if (!searchTerm || !searchTerm.trim()) {
    return aparelhos;
  }

  const termoLimpo = normalizarTexto(expandirAtalhosBusca(searchTerm));
  // Divide a busca em tokens/palavras individuais
  const tokensBusca = termoLimpo.split(/\s+/).filter(Boolean);

  if (tokensBusca.length === 0) return aparelhos;

  const temTokenPro = tokensBusca.includes('pro');
  const temTokenMax = tokensBusca.includes('max') || tokensBusca.includes('pm');
  const temTokenMini = tokensBusca.includes('mini');
  const temTokenPlus = tokensBusca.includes('plus');

  const resultados: ResultadoBuscaAparelho[] = [];

  for (const ap of aparelhos) {
    const modeloNorm = normalizarTexto(ap.modelo || '');
    const marcaNorm = normalizarTexto(ap.marca || '');
    const corNorm = normalizarTexto(ap.cor || '');
    const capNorm = normalizarTexto(ap.capacidade || '');
    const batNorm = normalizarTexto(String(ap.saudeBateria || ap.saude_bateria || ''));
    const codNorm = normalizarTexto(getAparelhoCodigo(ap) || '');
    const imeiNorm = String(ap.imei || '').trim();
    const numSerieNorm = normalizarTexto(ap.numeroSerie || '');
    const clienteNorm = normalizarTexto(ap.cliente || '');
    const descNorm = normalizarTexto(ap.descricao || '');
    const obsNorm = normalizarTexto(ap.observacoes || '');
    const condNorm = normalizarTexto(ap.condicao || '');

    // Verifica se o modelo do aparelho possui sufixos específicos
    const modeloTemMax = modeloNorm.includes('max');
    const modeloTemPlus = modeloNorm.includes('plus');

    // REGRA DE EXCLUSÃO DE SUFIXO DE MODELO:
    // Se a busca especificou "pro" MAS NÃO especificou "max", e o modelo é "Pro Max", ignora esse aparelho (ex: busca "15 pro" não traz "15 Pro Max").
    if (temTokenPro && !temTokenMax && modeloTemMax) {
      continue;
    }

    // Prepara sinônimos para a cor do aparelho
    const sinonimosCorAparelho = [corNorm];
    if (corNorm) {
      for (const [chave, sinonimos] of Object.entries(SINONIMOS_CORES)) {
        if (corNorm.includes(chave)) {
          sinonimosCorAparelho.push(...sinonimos);
        }
      }
    }

    // Junta todo o texto do aparelho para verificação completa
    const textoCompleto = [
      modeloNorm,
      marcaNorm,
      corNorm,
      ...sinonimosCorAparelho,
      capNorm,
      batNorm,
      batNorm ? `bateria ${batNorm}` : '',
      batNorm ? `${batNorm}%` : '',
      codNorm,
      imeiNorm,
      numSerieNorm,
      clienteNorm,
      descNorm,
      obsNorm,
      condNorm,
      ap.preco ? `r$ ${ap.preco}` : '',
      ap.preco ? String(ap.preco) : '',
    ].join(' ');

    // Checa se TODOS os tokens da busca estão presentes em pelo menos algum campo do aparelho
    let todosTokensBatem = true;
    for (const token of tokensBusca) {
      // Se o token for algo como "89%" ou "89", checa se bate com a bateria ou texto
      const tokenSemPorcentagem = token.replace('%', '');
      const bateBateria = (token.endsWith('%') || /^\d{2}$/.test(token)) && batNorm.includes(tokenSemPorcentagem);
      
      // Checa sinônimos de cor para o token da busca
      const sinonimosTokenBusca = [token, ...(SINONIMOS_CORES[token] || [])];
      const bateCor = sinonimosTokenBusca.some(s => corNorm.includes(s) || descNorm.includes(s));

      const bateGenerico = textoCompleto.includes(token) || bateBateria || bateCor;

      if (!bateGenerico) {
        todosTokensBatem = false;
        break;
      }
    }

    if (!todosTokensBatem) continue;

    // CÁLCULO DE RELEVÂNCIA (SCORE)
    let score = 10;

    // 1. Se o modelo é correspondência exata do termo buscado (ex: "iPhone 15 Pro" == "iPhone 15 Pro")
    if (modeloNorm.endsWith(termoLimpo) || modeloNorm === `apple ${termoLimpo}` || modeloNorm === `iphone ${termoLimpo}`) {
      score += 200;
    } else if (tokensBusca.every(t => modeloNorm.includes(t))) {
      // Se todas as palavras da busca estão no nome do modelo
      score += 100;
      // Recompensa modelos sem palavras extras sobrantes
      if (!modeloTemMax && !temTokenMax) score += 50;
    }

    // 2. Correspondência direta de IMEI ou Código
    if (imeiNorm.includes(termoLimpo) || codNorm.includes(termoLimpo) || numSerieNorm.includes(termoLimpo)) {
      score += 150;
    }

    // 3. Correspondência de cor / capacidade / bateria
    if (tokensBusca.some(t => corNorm.includes(t))) score += 30;
    if (tokensBusca.some(t => capNorm.includes(t))) score += 20;
    if (tokensBusca.some(t => batNorm && t.includes(batNorm))) score += 20;

    resultados.push({ aparelho: ap, score });
  }

  // Ordena pelo maior score primeiro
  resultados.sort((a, b) => b.score - a.score);

  return resultados.map(r => r.aparelho);
}
