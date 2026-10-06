import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gerarTemplateBaseMercadoPhone,
  converterAparelhoParaLinhaMP,
  montarMatrizEstoqueMercadoPhone,
  criarWorkbookMercadoPhone,
  formatarDataMercadoPhone,
  AparelhoExportacaoMP,
} from "./exportarMercadoPhone";

describe("Exportação para Mercado Phone (MP)", () => {
  it("deve gerar o template base com instruções e colunas oficiais", () => {
    const template = gerarTemplateBaseMercadoPhone();
    assert.equal(template.length, 18, "O template base deve ter exatamente 18 linhas");

    // Linha 2 (índice 1): Título da planilha
    assert.equal(template[1][3], "Tabela para Importação de Estoque Mercado Phone");

    // Linha 18 (índice 17): Cabeçalho das colunas
    const colunas = template[17];
    assert.equal(colunas[1], "Tipo");
    assert.equal(colunas[2], "Modelo Aparelho");
    assert.equal(colunas[4], "Imei");
    assert.equal(colunas[6], "GB");
    assert.equal(colunas[8], "Saúde da Bateria");
    assert.equal(colunas[9], "Cor");
    assert.equal(colunas[10], "Estado do Aparelho");
    assert.equal(colunas[14], "Disponibilidade");
    assert.equal(colunas[15], "Quantidade");
    assert.equal(colunas[16], "Valor Custo");
    assert.equal(colunas[17], "Valor Venda");
    assert.equal(colunas[18], "Valor Venda 2");
    assert.equal(colunas[22], "Data Entrada");
  });

  it("deve formatar data no padrão nacional brasileiro DD/MM/AAAA aceito pelo MP", () => {
    assert.equal(formatarDataMercadoPhone("2026-10-06"), "06/10/2026");
    assert.equal(formatarDataMercadoPhone("2026-10-06T15:30:00.000Z"), "06/10/2026");
    assert.equal(formatarDataMercadoPhone("2026-05-18"), "18/05/2026");
    assert.equal(formatarDataMercadoPhone("06/10/2026"), "06/10/2026");
    assert.equal(formatarDataMercadoPhone("7/9/2026"), "07/09/2026");
    // Se data for inválida ou vazia, retorna data de hoje no formato DD/MM/AAAA
    const hoje = formatarDataMercadoPhone(undefined);
    assert.match(hoje, /^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("deve converter aparelho em linha compatível com o Mercado Phone com data em DD/MM/AAAA", () => {
    const aparelho: AparelhoExportacaoMP = {
      modelo: "  iPhone 15 Pro Max ",
      imei: "354892019482019",
      capacidade: "256 GB",
      saudeBateria: "98%",
      cor: "Titânio Natural",
      condicao: "seminovo",
      marca: "Apple",
      custo: 4200.5,
      preco: 5690.0,
      precoAtacado: 5400.0,
      observacoes: "Impecável com caixa",
      codigo: "AP-0012",
      quantidade: 1,
      dataCadastro: "2026-10-06",
    };

    const linha = converterAparelhoParaLinhaMP(aparelho);
    assert.equal(linha[1], "Celular");
    assert.equal(linha[2], "iPhone 15 Pro Max"); // Normalizado
    assert.equal(linha[4], "354892019482019"); // IMEI
    assert.equal(linha[6], "256gb"); // GB limpo
    assert.equal(linha[8], "98"); // Apenas número da bateria
    assert.equal(linha[9], "TITÂNIO NATURAL"); // Cor em maiúsculas
    assert.equal(linha[10], "SEMINOVO"); // Estado
    assert.equal(linha[11], "Apple"); // Marca
    assert.equal(linha[14], "Disponível para venda"); // Disponibilidade
    assert.equal(linha[15], 1); // Quantidade
    assert.equal(linha[16], "4200,50"); // Custo com vírgula
    assert.equal(linha[17], "5690,00"); // Venda com vírgula
    assert.equal(linha[18], "5400,00"); // Atacado
    assert.equal(linha[21], "AP-0012"); // Código de barras
    assert.equal(linha[22], "06/10/2026"); // Data de Entrada no formato DD/MM/AAAA
  });

  it("deve montar matriz de estoque limpa sem linhas 'final' ou letras 'f' que quebrem o validador do MP", () => {
    const aparelhos: AparelhoExportacaoMP[] = [
      {
        modelo: "iPhone 13",
        preco: 2900,
        condicao: "seminovo",
        cor: "Meia-noite",
        dataCadastro: "2026-10-06",
      },
    ];

    const matriz = montarMatrizEstoqueMercadoPhone(aparelhos);
    // 18 linhas de template + 1 linha de aparelho real (SEM linhas espúrias com 'f')
    assert.equal(matriz.length, 18 + 1);

    const linhaProduto = matriz[18];
    assert.equal(linhaProduto[2], "iPhone 13");
    assert.equal(linhaProduto[14], "Disponível para venda");
    assert.equal(linhaProduto[17], "2900,00");
    assert.equal(linhaProduto[22], "06/10/2026");

    // Garante que nenhuma linha contém o valor 'f' que causava 'Formato de data inválido: f'
    for (const row of matriz) {
      assert.ok(!row.includes("f"), "A matriz de produtos não deve conter células com 'f'");
      assert.notEqual(row[1], "final", "A matriz de produtos não deve conter linha sentinela 'final'");
    }

    // Verifica que gera o workbook com as abas Produtos e Dados
    const wb = criarWorkbookMercadoPhone(matriz);
    assert.ok(wb.SheetNames.includes("Produtos"));
    assert.ok(wb.SheetNames.includes("Dados"));
  });

  it("deve remover 100% dos emojis de cores, modelos e observações para compatibilidade estrita com o MP", () => {
    const aparelhoComEmojis: AparelhoExportacaoMP = {
      modelo: "🔵 iPhone 15 Pro Max 🌸",
      cor: "🔵 Azul Titânio",
      observacoes: "Aparelho impecável ✨ sem marcas 🔥",
      fornecedor: "📦 Fornecedor SP",
      condicao: "seminovo",
      capacidade: "256 GB",
      preco: 4500,
    };

    const linha = converterAparelhoParaLinhaMP(aparelhoComEmojis);
    // Modelo deve estar sem emojis
    assert.equal(linha[2], "iPhone 15 Pro Max");
    // Cor deve estar sem o emoji 🔵 e em caixa alta
    assert.equal(linha[9], "AZUL TITÂNIO");
    // Observações devem estar sem ✨ e 🔥
    assert.equal(linha[13], "Aparelho impecável sem marcas");
    // Fornecedor deve estar sem 📦
    assert.equal(linha[20], "Fornecedor SP");

    // Testa também cores comuns com outros emojis
    const testePreto = converterAparelhoParaLinhaMP({ modelo: "13", cor: "⚫ Preto", preco: 2000 });
    assert.equal(testePreto[9], "PRETO");

    const testeRosa = converterAparelhoParaLinhaMP({ modelo: "15", cor: "🌸 Rosa", preco: 3000 });
    assert.equal(testeRosa[9], "ROSA");

    const testeDesert = converterAparelhoParaLinhaMP({ modelo: "16 Pro", cor: "🏜️ Desert", preco: 6000 });
    assert.equal(testeDesert[9], "DESERT");
  });

  it("deve reconhecer iPhone Air como aparelho celular na exportação", () => {
    const apAir = converterAparelhoParaLinhaMP({
      modelo: "Air",
      cor: "Preto",
      capacidade: "256GB",
      preco: 5800,
    });

    assert.equal(apAir[1], "Celular");
    assert.equal(apAir[2], "iPhone Air");
    assert.equal(apAir[9], "PRETO");

    const ap17Air = converterAparelhoParaLinhaMP({
      modelo: "17 Air",
      cor: "Branco",
      capacidade: "512GB",
      preco: 6400,
    });

    assert.equal(ap17Air[1], "Celular");
    assert.equal(ap17Air[2], "iPhone 17 Air");
  });

  it("deve preencher template XLSX mantendo cabeçalho e sem adicionar linhas com 'f'", async () => {
    const { preencherArquivoTemplateMP } = await import("./exportarMercadoPhone");
    const XLSX = await import("xlsx");

    // Cria um buffer de template falso simulando o Mercado Phone
    const templateBase = gerarTemplateBaseMercadoPhone();
    const wbSimulado = XLSX.utils.book_new();
    const wsSimulada = XLSX.utils.aoa_to_sheet(templateBase);
    XLSX.utils.book_append_sheet(wbSimulado, wsSimulada, "Produtos");
    const buffer = XLSX.write(wbSimulado, { type: "array", bookType: "xlsx" });

    const aparelhos: AparelhoExportacaoMP[] = [
      {
        modelo: "iPhone 15 Pro",
        cor: "Natural",
        preco: 5000,
        dataCadastro: "2026-10-06",
      },
    ];

    const wbPreenchido = await preencherArquivoTemplateMP(buffer, aparelhos);
    assert.ok(wbPreenchido.SheetNames.includes("Produtos"));

    const sheet = wbPreenchido.Sheets["Produtos"];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: true }) as (string | number)[][];
    
    // 18 linhas de template + 1 linha de aparelho
    assert.equal(rows.length, 19);
    assert.equal(rows[18][2], "iPhone 15 Pro");
    assert.equal(rows[18][22], "06/10/2026");

    // Garante que não há linha com 'f'
    for (const r of rows) {
      assert.ok(!r.includes("f"));
    }
  });
});
