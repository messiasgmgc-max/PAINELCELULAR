import * as XLSX from "xlsx";
import { normalizarNomeModelo } from "@/lib/utils";

/**
 * Interface com os dados mínimos necessários de um aparelho para exportação MP.
 */
export interface AparelhoExportacaoMP {
  id?: string;
  marca?: string;
  modelo: string;
  imei?: string;
  imei2?: string;
  segundo_imei?: string;
  numeroSerie?: string;
  cor?: string;
  capacidade?: string;
  condicao?: string;
  preco?: number;
  precoAtacado?: number;
  custo?: number;
  saudeBateria?: string;
  saude_bateria?: string;
  codigo?: string;
  descricao?: string;
  observacoes?: string;
  fornecedor?: string;
  dataCadastro?: string;
  quantidade?: number;
  categoria?: string;
  memoria_ram?: string | number;
  ram?: string | number;
  diasGarantia?: number | string;
  garantiaDias?: number | string;
}

/**
 * Template padrão exato da planilha oficial de importação do Mercado Phone.
 * Reproduz as 18 primeiras linhas de instruções e cabeçalhos idênticos aos distribuídos pelo MP.
 */
export function gerarTemplateBaseMercadoPhone(): (string | number)[][] {
  const matriz: (string | number)[][] = [];

  // Cria 16 linhas iniciais (linhas 0 a 15) com 49 colunas vazias
  for (let i = 0; i < 16; i++) {
    matriz.push(new Array(49).fill(""));
  }

  // Linha 2 (índice 1): Título na coluna D (índice 3)
  matriz[1][3] = "Tabela para Importação de Estoque Mercado Phone";

  // Linha 4 (índice 3): Instrução 1
  matriz[3][3] = "Os campos Tipo, Modelo Aparelho, Disponibilidade, Valor Venda são obrigatórios.";

  // Linha 6 (índice 5): Instrução 2
  matriz[5][3] = "Os campos Imei e Imei2 podem ficar como notação científica, ex: 3,50923E+14. Ao importar, será corrigido automaticamente.";

  // Linha 8 (índice 7): Instrução 3
  matriz[7][3] = "Os campos de valores devem ficar no formato padrão, ex: 2000.00 ou 2000,00. Se deixar separação de milhar, pode dar erro, ex: 2.000";

  // Linha 10 (índice 9): Instrução 4
  matriz[9][3] = "Caso não exista a sua opção nos campos de multipla escolha, podem digitar o desejado.";

  // Linha 12 (índice 11): Instrução 5
  matriz[11][3] = "Qualquer dúvida, entre em contato com o suporte!";

  // Linha 14 (índice 13): Instrução 6
  matriz[13][3] = "Não alterar a estrutura da planilha, isso pode prejudicar o cadastro do estoque";

  // Linha 17 (índice 16): Blocos de cabeçalho
  const linhaBlocos: (string | number)[] = new Array(49).fill("");
  linhaBlocos[1] = "Detalhes do Produto para Cadastro";
  linhaBlocos[29] = "Dados para Emissão de NF";
  linhaBlocos[36] = "Formas de Pagamento";
  linhaBlocos[43] = "Campos extras";
  matriz.push(linhaBlocos);

  // Linha 18 (índice 17): Nomes exatos das colunas (49 colunas, de A até AW)
  const linhaColunas: (string | number)[] = [
    "", // Col A (0)
    "Tipo", // Col B (1)
    "Modelo Aparelho", // Col C (2)
    "Serial Number", // Col D (3)
    "Imei", // Col E (4)
    "Imei 2", // Col F (5)
    "GB", // Col G (6)
    "Memória RAM", // Col H (7)
    "Saúde da Bateria", // Col I (8)
    "Cor", // Col J (9)
    "Estado do Aparelho", // Col K (10)
    "Marca", // Col L (11)
    "Subcategoria", // Col M (12)
    "Observação", // Col N (13)
    "Disponibilidade", // Col O (14)
    "Quantidade", // Col P (15)
    "Valor Custo", // Col Q (16)
    "Valor Venda", // Col R (17)
    "Valor Venda 2", // Col S (18)
    "Valor Venda 3", // Col T (19)
    "Fornecedor", // Col U (20)
    "Código de Barras (EAN-13)", // Col V (21)
    "Data Entrada", // Col W (22)
    "SKU", // Col X (23)
    "Categoria", // Col Y (24)
    "0 – Aparelho / 1 – Acessório / 2 - Peça / 3 - Serviço", // Col Z (25)
    "Quantidade mínima", // Col AA (26)
    "Dias de Garantia", // Col AB (27)
    "", // Col AC (28)
    "CEST", // Col AD (29)
    "CST", // Col AE (30)
    "NCM", // Col AF (31)
    "CFOP Estadual", // Col AG (32)
    "CFOP Inter Estadual", // Col AH (33)
    "Origem", // Col AI (34)
    "", // Col AJ (35)
    "Forma de pagamento 1", // Col AK (36)
    "Valor 1", // Col AL (37)
    "Forma de pagamento 2", // Col AM (38)
    "Valor 2", // Col AN (39)
    "Forma de pagamento 3", // Col AO (40)
    "Valor 3", // Col AP (41)
    "", // Col AQ (42)
    "Nome do campo 1", // Col AR (43)
    "Valor 1", // Col AS (44)
    "Nome do campo 2", // Col AT (45)
    "Valor 2", // Col AU (46)
    "Nome do campo 3", // Col AV (47)
    "Valor 3", // Col AW (48)
  ];
  matriz.push(linhaColunas);

  return matriz;
}

/**
 * Remove qualquer emoji, pictograma, símbolo de marcador ou variação unicode de um texto,
 * garantindo compatibilidade estrita com importadores como o Mercado Phone que rejeitam emojis.
 * Preserva 100% de letras, números (ex: iPhone 15 Pro Max) e pontuações válidas.
 */
export function limparTextoMercadoPhone(texto?: string | null): string {
  if (!texto) return "";
  return String(texto)
    // Remove sequências de keycap com emoji (ex: 1️⃣, 2️⃣)
    .replace(/\d\uFE0F?\u20E3/gu, "")
    // Remove emojis e pictogramas unicode (sem Emoji_Component para não apagar dígitos ASCII!)
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}/gu, "")
    // Remove marcadores geométricos específicos e símbolos de status frequentemente usados em celulares
    .replace(/[▫◽▪◾◼◻⬛⬜⚪⚫🔴🔵🟣🟡🟢🟠🔶🔷🔸🔹⭐✨🔥🎉🌸🏜🔘❤️🤍🤎🖤💜💙💚💛🧡🆕♻️⚠️]/gu, "")
    // Remove seletores de variação unicode (Variation Selectors) e Zero Width Joiners
    .replace(/[\uFE00-\uFE0F\u200D]/g, "")
    // Remove caracteres de controle
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    // Normaliza múltiplos espaços
    .replace(/\s+/g, " ")
    // Remove pontuações / traços soltos que sobram nas pontas após a remoção do emoji (ex: "- AZUL" ou "AZUL -")
    .replace(/^[\s\-_–—:;|•/]+|[\s\-_–—:;|•/]+$/g, "")
    .trim();
}

/**
 * Normaliza e limpa a cor do aparelho para o Mercado Phone (sem emojis e em maiúsculas).
 */
export function limparCorMercadoPhone(corRaw?: string | null): string {
  if (!corRaw) return "";
  return limparTextoMercadoPhone(corRaw).toUpperCase();
}

/**
 * Formata data no padrão brasileiro DD/MM/AAAA (ex: 06/10/2026) exigido pelo Mercado Phone.
 * Se nenhuma data for fornecida ou for inválida, utiliza a data atual em DD/MM/AAAA.
 */
export function formatarDataMercadoPhone(dataRaw?: string | Date | null): string {
  if (!dataRaw) {
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, "0");
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    const ano = hoje.getFullYear();
    return `${dia}/${mes}/${ano}`;
  }

  try {
    if (typeof dataRaw === "string") {
      const trimmed = dataRaw.trim();
      // Se já estiver no formato brasileiro DD/MM/AAAA
      const matchBr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (matchBr) {
        const dia = matchBr[1].padStart(2, "0");
        const mes = matchBr[2].padStart(2, "0");
        const ano = matchBr[3];
        return `${dia}/${mes}/${ano}`;
      }
      // Se estiver no formato ISO YYYY-MM-DD
      const matchIso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (matchIso) {
        const [, ano, mes, dia] = matchIso;
        return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}`;
      }
    }

    const d = typeof dataRaw === "string" ? new Date(dataRaw) : dataRaw;
    if (d instanceof Date && !isNaN(d.getTime())) {
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    }
  } catch {
    // fallback
  }

  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const ano = hoje.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Converte um único aparelho do estoque em uma linha de 49 colunas compatível com o Mercado Phone.
 */
export function converterAparelhoParaLinhaMP(aparelho: AparelhoExportacaoMP): (string | number)[] {
  // 1. Tipo (sem emojis)
  let tipo = "Celular";
  if (aparelho.categoria === "acessorio") tipo = "Acessório";
  else if (aparelho.categoria === "perfume") tipo = "Perfume";
  tipo = limparTextoMercadoPhone(tipo);

  // 2. Modelo Aparelho (normalizado e sem emojis)
  const modeloLimpo = limparTextoMercadoPhone(aparelho.modelo);
  const modelo = normalizarNomeModelo(modeloLimpo);

  // 3. Serial Number
  const serial = aparelho.numeroSerie ? limparTextoMercadoPhone(String(aparelho.numeroSerie)) : "";

  // 4. IMEI
  const imei = aparelho.imei ? String(aparelho.imei).trim() : "";

  // 5. IMEI 2
  const imei2 = aparelho.imei2 || aparelho.segundo_imei ? String(aparelho.imei2 || aparelho.segundo_imei).trim() : "";

  // 6. Capacidade / GB (formato padronizado ex: '128gb', '64gb')
  let gb = "";
  if (aparelho.capacidade) {
    gb = limparTextoMercadoPhone(String(aparelho.capacidade)).toLowerCase().replace(/\s+/g, "");
  }

  // 7. Memória RAM
  const ram = aparelho.memoria_ram || aparelho.ram ? limparTextoMercadoPhone(String(aparelho.memoria_ram || aparelho.ram)) : "";

  // 8. Saúde da Bateria (apenas o número inteiro)
  let bateria = "";
  const bRaw = aparelho.saudeBateria || aparelho.saude_bateria;
  if (bRaw) {
    const num = parseInt(String(bRaw).replace(/\D/g, ""), 10);
    if (!isNaN(num) && num > 0 && num <= 100) {
      bateria = String(num);
    }
  }

  // 9. Cor (em caixa alta e 100% livre de emojis)
  const cor = limparCorMercadoPhone(aparelho.cor);

  // 10. Estado do Aparelho (NOVO ou SEMINOVO, sem emojis)
  const cond = limparTextoMercadoPhone(aparelho.condicao || "").toLowerCase();
  const estado = cond === "novo" ? "NOVO" : "SEMINOVO";

  // 11. Marca
  const marca = aparelho.marca ? limparTextoMercadoPhone(String(aparelho.marca)) : "Apple";

  // 12. Subcategoria
  const subcategoria = "";

  // 13. Observação (sem emojis para não travar o validador do MP)
  const observacao = limparTextoMercadoPhone(aparelho.observacoes || aparelho.descricao || "");

  // 14. Disponibilidade (obrigatório pelo MP)
  const disponibilidade = "Disponível para venda";

  // 15. Quantidade
  const quantidade = typeof aparelho.quantidade === "number" && aparelho.quantidade > 0 ? aparelho.quantidade : 1;

  // 16. Valor Custo (formato '2000,00')
  let valorCusto = "";
  if (typeof aparelho.custo === "number" && aparelho.custo > 0) {
    valorCusto = aparelho.custo.toFixed(2).replace(".", ",");
  }

  // 17. Valor Venda (formato '3000,00' - obrigatório pelo MP)
  let valorVenda = "0,00";
  if (typeof aparelho.preco === "number" && aparelho.preco > 0) {
    valorVenda = aparelho.preco.toFixed(2).replace(".", ",");
  }

  // 18. Valor Venda 2 (Preço Atacado se houver)
  let valorVenda2 = "";
  if (typeof aparelho.precoAtacado === "number" && aparelho.precoAtacado > 0) {
    valorVenda2 = aparelho.precoAtacado.toFixed(2).replace(".", ",");
  }

  // 19. Valor Venda 3
  const valorVenda3 = "";

  // 20. Fornecedor (sem emojis)
  const fornecedor = aparelho.fornecedor ? limparTextoMercadoPhone(String(aparelho.fornecedor)) : "";

  // 21. Código de Barras
  const codigoBarras = aparelho.codigo ? String(aparelho.codigo).trim() : "";

  // 22. Data Entrada (formato DD/MM/AAAA obrigatório pelo Mercado Phone)
  const dataEntrada = formatarDataMercadoPhone(aparelho.dataCadastro);

  // 23. SKU
  const sku = aparelho.codigo || aparelho.id || "";

  // 24. Categoria
  const categoria = "";

  // 25. 0 – Aparelho / 1 – Acessório / 2 - Peça / 3 - Serviço
  const tipoNum = aparelho.categoria === "acessorio" ? 1 : 0;

  // 26. Quantidade mínima
  const qtdMin = "";

  // 27. Dias de Garantia
  const garantia = aparelho.diasGarantia || aparelho.garantiaDias || 90;

  // Monta linha de 49 colunas
  const row: (string | number)[] = new Array(49).fill("");
  row[0] = "";
  row[1] = tipo;
  row[2] = modelo;
  row[3] = serial;
  row[4] = imei;
  row[5] = imei2;
  row[6] = gb;
  row[7] = ram;
  row[8] = bateria;
  row[9] = cor;
  row[10] = estado;
  row[11] = marca;
  row[12] = subcategoria;
  row[13] = observacao;
  row[14] = disponibilidade;
  row[15] = quantidade;
  row[16] = valorCusto;
  row[17] = valorVenda;
  row[18] = valorVenda2;
  row[19] = valorVenda3;
  row[20] = fornecedor;
  row[21] = codigoBarras;
  row[22] = dataEntrada;
  row[23] = sku;
  row[24] = categoria;
  row[25] = tipoNum;
  row[26] = qtdMin;
  row[27] = garantia;

  return row;
}

/**
 * Retorna as linhas da aba auxiliar 'Dados' com as tabelas de apoio de RAM, cores, etc.
 * Mantida separada da aba 'Produtos' para não gerar falsos positivos no validador do MP.
 */
export function gerarAbaDadosMercadoPhone(): (string | number)[][] {
  return [
    [],
    ["", "Aparelho", "", "", "", "", "NF"],
    ["", "Ram", "Cor", "Estado", "Disponibilidade", "", "CST", "Origem"],
    ["", "", "", "", "Disponível para venda"],
    ["", 2, "PRETO", "NOVO", "Laboratório", "", 101, 0],
    ["", 3, "BRANCO", "SEMINOVO", "", "", 102, 1],
    ["", 4, "CINZA", "", "", "", 103, 2],
    ["", 6, "AZUL", "", "", "", 201, 3],
    ["", 8, "VERDE", "", "", "", 202, 4],
    ["", 12, "ROXO", "", "", "", 203, 5],
    ["", 16, "DOURADO", "", "", "", 300, 6],
    ["", "", "SPACE GRAY", "", "", "", 400, 7],
    ["", "", "VERMELHO", "", "", "", 500, 8],
    ["", "", "", "", "", "", 900],
  ];
}

/**
 * Cria a matriz da aba de produtos contendo:
 * - Linhas 0 a 17: Cabeçalho oficial do Mercado Phone
 * - Linhas 18 em diante: Apenas os aparelhos em estoque cadastrados (SEM linhas com 'f' no fim)
 */
export function montarMatrizEstoqueMercadoPhone(aparelhos: AparelhoExportacaoMP[]): (string | number)[][] {
  const base = gerarTemplateBaseMercadoPhone();

  // Se não houver aparelhos, inclui pelo menos uma linha com disponibilidade
  if (aparelhos.length === 0) {
    const linhaVazia = new Array(49).fill("");
    linhaVazia[14] = "Disponível para venda";
    linhaVazia[15] = 1;
    base.push(linhaVazia);
  } else {
    for (const ap of aparelhos) {
      base.push(converterAparelhoParaLinhaMP(ap));
    }
  }

  // ATENÇÃO: NÃO adiciona linhas com 'f' na aba de produtos.
  // O importador do Mercado Phone lê as linhas sequencialmente e rejeita textos espúrios.
  return base;
}

/**
 * Cria o Workbook XLSX formatado para o Mercado Phone, com a aba principal 'Produtos'
 * e a aba de apoio 'Dados'.
 */
export function criarWorkbookMercadoPhone(matriz: (string | number)[][]): XLSX.WorkBook {
  const wsProdutos = XLSX.utils.aoa_to_sheet(matriz);

  // Força células de IMEI (colunas E e F) e Serial (D) e Código (V) como texto explícito ('s')
  // para evitar notação científica ou perda de precisão no Excel
  Object.keys(wsProdutos).forEach((cellKey) => {
    if (cellKey.startsWith("!")) return;
    const cell = wsProdutos[cellKey];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
    }
  });

  const wsDados = XLSX.utils.aoa_to_sheet(gerarAbaDadosMercadoPhone());

  const workbook = XLSX.utils.book_new();
  // No Mercado Phone a primeira aba chama-se 'Produtos' e a segunda 'Dados'
  XLSX.utils.book_append_sheet(workbook, wsProdutos, "Produtos");
  XLSX.utils.book_append_sheet(workbook, wsDados, "Dados");
  return workbook;
}

/**
 * Injeta o estoque em um arquivo XLSX do Mercado Phone fornecido como template pelo usuário,
 * preservando todas as abas originais e substituindo apenas a lista de produtos.
 */
export async function preencherArquivoTemplateMP(
  templateBuffer: ArrayBuffer,
  aparelhos: AparelhoExportacaoMP[]
): Promise<XLSX.WorkBook> {
  const wbOriginal = XLSX.read(templateBuffer, { type: "array", cellDates: false });
  const sheetName = wbOriginal.SheetNames.find((s) => s.toLowerCase() === "produtos") || wbOriginal.SheetNames[0] || "Produtos";
  const sheetOriginal = wbOriginal.Sheets[sheetName];

  if (!sheetOriginal) {
    const matrizNova = montarMatrizEstoqueMercadoPhone(aparelhos);
    return criarWorkbookMercadoPhone(matrizNova);
  }

  // Converte a planilha original para matriz preservando linhas em branco do cabeçalho
  const matrizOriginal = XLSX.utils.sheet_to_json(sheetOriginal, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: false,
  }) as (string | number)[][];

  // Localiza a linha do cabeçalho oficial que contém 'Tipo' na coluna B (índice 1) e 'Modelo Aparelho' na coluna C (índice 2)
  let headerIndex = -1;
  for (let r = 0; r < Math.min(matrizOriginal.length, 30); r++) {
    const row = matrizOriginal[r] || [];
    const col1 = String(row[1] || "").trim().toLowerCase();
    const col2 = String(row[2] || "").trim().toLowerCase();
    if (col1 === "tipo" && col2.includes("modelo")) {
      headerIndex = r;
      break;
    }
  }

  if (headerIndex === -1) {
    // Se não encontrou cabeçalho no arquivo enviado, monta matriz completa padrão
    const matrizNova = montarMatrizEstoqueMercadoPhone(aparelhos);
    return criarWorkbookMercadoPhone(matrizNova);
  }

  const cabecalhoMatriz = matrizOriginal.slice(0, headerIndex + 1);

  // Monta as linhas dos aparelhos ativos (sem lixo ou 'f' no fim)
  const linhasProdutos: (string | number)[][] = aparelhos.map((ap) => converterAparelhoParaLinhaMP(ap));

  const matrizFinal: (string | number)[][] = [
    ...cabecalhoMatriz,
    ...linhasProdutos,
  ];

  // Atualiza a aba no workbook original, preservando demais abas (ex: 'Dados')
  const newSheet = XLSX.utils.aoa_to_sheet(matrizFinal);
  Object.keys(newSheet).forEach((cellKey) => {
    if (cellKey.startsWith("!")) return;
    const cell = newSheet[cellKey];
    if (cell && typeof cell.v === "string") {
      cell.t = "s";
    }
  });

  wbOriginal.Sheets[sheetName] = newSheet;
  return wbOriginal;
}

/**
 * Gera e dispara o download do arquivo .xlsx formatado para o Mercado Phone no navegador.
 */
export async function exportarEstoqueParaMercadoPhone(
  aparelhos: AparelhoExportacaoMP[],
  opcoes?: {
    nomeArquivo?: string;
    templateCustomizado?: File | ArrayBuffer | null;
  }
): Promise<string> {
  const dataHoje = new Date().toISOString().split("T")[0];
  const nomeArquivo = opcoes?.nomeArquivo || `estoque_mercadophone_${dataHoje}.xlsx`;

  let workbook: XLSX.WorkBook;

  if (opcoes?.templateCustomizado) {
    let buffer: ArrayBuffer;
    if (opcoes.templateCustomizado instanceof File) {
      buffer = await opcoes.templateCustomizado.arrayBuffer();
    } else {
      buffer = opcoes.templateCustomizado;
    }
    workbook = await preencherArquivoTemplateMP(buffer, aparelhos);
  } else {
    const matriz = montarMatrizEstoqueMercadoPhone(aparelhos);
    workbook = criarWorkbookMercadoPhone(matriz);
  }

  // Gera o arquivo e aciona o download nativo no browser
  XLSX.writeFile(workbook, nomeArquivo, { bookType: "xlsx" });
  return nomeArquivo;
}
