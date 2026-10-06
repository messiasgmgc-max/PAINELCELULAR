import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gerarTemplateBaseMercadoPhone,
  converterAparelhoParaLinhaMP,
  montarMatrizEstoqueMercadoPhone,
  criarWorkbookMercadoPhone,
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
  });

  it("deve converter aparelho em linha compatível com o Mercado Phone", () => {
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
  });

  it("deve montar matriz completa com produtos e bloco final", () => {
    const aparelhos: AparelhoExportacaoMP[] = [
      {
        modelo: "iPhone 13",
        preco: 2900,
        condicao: "seminovo",
        cor: "Meia-noite",
      },
    ];

    const matriz = montarMatrizEstoqueMercadoPhone(aparelhos);
    // 18 linhas de template + 1 linha de aparelho + 15 linhas finais
    assert.equal(matriz.length, 18 + 1 + 15);

    const linhaProduto = matriz[18];
    assert.equal(linhaProduto[2], "iPhone 13");
    assert.equal(linhaProduto[14], "Disponível para venda");
    assert.equal(linhaProduto[17], "2900,00");

    // Verifica que gera o workbook
    const wb = criarWorkbookMercadoPhone(matriz);
    assert.ok(wb.SheetNames.includes("Planilha1"));
  });
});
