import PDFDocument from 'pdfkit';

export interface DadosReciboPdf {
  vendaId: string;
  codigoVenda: string;
  dataEmissao?: string;
  loja: {
    nome: string;
    cnpj?: string | null;
    telefone?: string | null;
    endereco?: string | null;
    cidade?: string | null;
    logoUrl?: string | null;
    assinaturaUrl?: string | null;
  };
  cliente: {
    nome: string;
    cpf?: string | null;
    telefone?: string | null;
    email?: string | null;
    endereco?: string | null;
  };
  aparelho: {
    modelo: string;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
    condicao?: string | null;
    valor: number;
  };
  itens?: Array<{
    modelo: string;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
    bateria?: number | null;
    observacao?: string | null;
    condicao?: string | null;
    valor: number;
  }>;
  upgrade?: {
    ativo: boolean;
    modelo?: string | null;
    imei?: string | null;
    valor?: number | null;
  } | null;
  upgrades?: Array<{
    modelo: string;
    capacidade?: string | null;
    cor?: string | null;
    imei?: string | null;
    valor?: number | null;
  }>;
  pagamento: {
    forma: string;
    valorTotal: number;
    valorEntrada?: number | null;
    valorFinal: number;
  };
  diasGarantia?: number;
  vendedor?: string | null;
  linkRecibo?: string | null;
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(valor) ? valor : 0
  );
}

/**
 * Remove emojis e pares substitutos UTF-16 não suportados pelas fontes padrão WinAnsi (Helvetica) do PDFKit,
 * evitando caracteres corrompidos como "Ø=Üñ" ou "Ø=Ý" no PDF gerado.
 */
export function limparTextoPdf(texto?: string | null): string {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte data URI (base64) ou URL pública em Buffer de imagem (PNG/JPEG) para o PDFKit.
 */
async function carregarBufferImagem(src?: string | null): Promise<Buffer | null> {
  if (!src || typeof src !== 'string') return null;
  const limpo = src.trim();
  if (!limpo) return null;

  try {
    const matchDataUri = limpo.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/i);
    if (matchDataUri && matchDataUri[1]) {
      return Buffer.from(matchDataUri[1].replace(/\s+/g, ''), 'base64');
    }

    if (limpo.startsWith('http://') || limpo.startsWith('https://')) {
      const resp = await fetch(limpo);
      if (!resp.ok) return null;
      const arr = await resp.arrayBuffer();
      return Buffer.from(arr);
    }
  } catch (err) {
    console.warn('[gerarReciboPdfBuffer] Aviso ao decodificar imagem da loja:', err);
  }
  return null;
}

/**
 * Gera o Recibo A4 oficial fiel ao modelo do sistema (src/lib/reciboA4.ts).
 * Contém o Canhoto de recebimento, cabeçalho da loja (com logo), dados do cliente,
 * tabela de produtos/aparelhos com IMEI, termo oficial de garantia da loja e assinaturas (com assinatura da loja).
 */
export async function gerarReciboPdfBuffer(dados: DadosReciboPdf): Promise<Buffer> {
  const [logoBuffer, assinaturaBuffer] = await Promise.all([
    carregarBufferImagem(dados.loja.logoUrl),
    carregarBufferImagem(dados.loja.assinaturaUrl),
  ]);

  return new Promise((resolve, reject) => {
    try {
      const nomeLoja = limparTextoPdf(dados.loja.nome || 'Phone Center') || 'Phone Center';
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        info: {
          Title: `Recibo #${dados.codigoVenda} - ${nomeLoja}`,
          Author: nomeLoja,
          Subject: 'Recibo de Venda e Termo de Garantia',
        },
      });

      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const x = 30;
      const w = 535;
      const codigoVenda = limparTextoPdf(dados.codigoVenda) || 'OK';
      const nomeCliente = limparTextoPdf(dados.cliente.nome || 'Não informado') || 'Não informado';

      // ─────────────────────────────────────────────────────────────
      // 1. CANHOTO DE RECEBIMENTO (Fiel ao cabeçalho de reciboA4.ts)
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, 25, w, 52).stroke('#000000');
      doc.rect(x, 25, w, 15).fillAndStroke('#f0f0f0', '#000000');

      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');
      doc.text(`RECIBO DE ${nomeLoja.toUpperCase()} - OS PRODUTOS E/OU SERVIÇOS CONSTANTES NO PEDIDO`, x, 29, {
        align: 'center',
        width: w,
      });

      // Linhas divisórias das 3 colunas do canhoto
      doc.moveTo(x + 160, 40).lineTo(x + 160, 77).stroke('#000000');
      doc.moveTo(x + 395, 40).lineTo(x + 395, 77).stroke('#000000');

      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      doc.text('Data de recebimento\n\n___/___/______', x + 6, 44, { width: 150 });
      doc.text('Identificação e assinatura do recebedor\n\n_________________________________________', x + 166, 44, {
        width: 220,
      });

      doc.fontSize(7.5).font('Helvetica');
      doc.text('Recibo da venda:', x + 400, 46, { width: 130, align: 'center' });
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`#${codigoVenda}`, x + 400, 58, { width: 130, align: 'center' });

      // Linha pontilhada separando o canhoto do corpo do recibo
      doc.dash(4, { space: 3 }).moveTo(x, 86).lineTo(x + w, 86).stroke('#000000').undash();

      // ─────────────────────────────────────────────────────────────
      // 2. DADOS DA EMPRESA / CABEÇALHO DO PEDIDO
      // ─────────────────────────────────────────────────────────────
      let y = 96;
      let xTextoLoja = x;
      let larguraTextoLoja = 330;

      if (logoBuffer) {
        try {
          doc.image(logoBuffer, x, y - 2, {
            fit: [80, 44],
            align: 'left',
            valign: 'center',
          });
          xTextoLoja = x + 88;
          larguraTextoLoja = 242;
        } catch (errLogo) {
          console.warn('[gerarReciboPdfBuffer] Falha ao inserir logo da loja no PDF:', errLogo);
        }
      }

      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold');
      doc.text(nomeLoja, xTextoLoja, y, { width: larguraTextoLoja });

      doc.fontSize(8).font('Helvetica');
      const enderecoLoja = limparTextoPdf(dados.loja.endereco || dados.loja.cidade || 'Endereço da loja');
      doc.text(enderecoLoja, xTextoLoja, y + 17, { width: larguraTextoLoja });

      const infoEmpresa = [
        dados.loja.cnpj ? `CPF/CNPJ: ${limparTextoPdf(dados.loja.cnpj)}` : null,
        dados.loja.telefone ? `Tel: ${limparTextoPdf(dados.loja.telefone)}` : null,
      ]
        .filter(Boolean)
        .join(' | ') || 'Telefone não informado';
      doc.text(infoEmpresa, xTextoLoja, y + 28, { width: larguraTextoLoja });

      // Lado direito: Data, Vendedor e Código
      const dataHoraFmt = limparTextoPdf(dados.dataEmissao || new Date().toLocaleString('pt-BR'));
      doc.fontSize(8).font('Helvetica');
      doc.text(`Data: ${dataHoraFmt}`, x + 330, y + 4, { align: 'right', width: 205 });
      doc.text(`VENDEDOR: ${limparTextoPdf(dados.vendedor || 'Não informado')}`, x + 330, y + 16, { align: 'right', width: 205 });
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(`RECIBO DA VENDA: #${codigoVenda}`, x + 330, y + 28, { align: 'right', width: 205 });

      y += 48;

      // ─────────────────────────────────────────────────────────────
      // 3. TABELA DESTINATÁRIO / CLIENTE
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('DESTINATÁRIO / CLIENTE', x, y + 3, { align: 'center', width: w });
      y += 14;

      doc.rect(x, y, w, 28).stroke('#000000');
      doc.moveTo(x + 220, y).lineTo(x + 220, y + 28).stroke('#000000');
      doc.moveTo(x + 325, y).lineTo(x + 325, y + 28).stroke('#000000');
      doc.moveTo(x + 430, y).lineTo(x + 430, y + 28).stroke('#000000');

      doc.fillColor('#000000').fontSize(7).font('Helvetica');
      doc.text('Nome/Razão social', x + 5, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(nomeCliente, x + 5, y + 13, { width: 210, ellipsis: true });

      doc.fontSize(7).font('Helvetica');
      doc.text('Telefone', x + 225, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.telefone || 'N/A', x + 225, y + 13);

      doc.fontSize(7).font('Helvetica');
      doc.text('CPF/CNPJ', x + 330, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.cpf || 'N/A', x + 330, y + 13);

      doc.fontSize(7).font('Helvetica');
      doc.text('E-mail', x + 435, y + 3);
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text(dados.cliente.email || 'N/A', x + 435, y + 13, { width: 95, ellipsis: true });

      y += 34;

      // ─────────────────────────────────────────────────────────────
      // 4. TABELA DADOS DO PRODUTO / APARELHO
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('DADOS DO PRODUTO / APARELHO', x, y + 3, { align: 'center', width: w });
      y += 14;

      // Cabeçalho das colunas de produtos
      const colW = { cod: 28, desc: 272, qtd: 30, unit: 65, descVal: 55, tot: 85 };
      doc.rect(x, y, w, 15).fillAndStroke('#fafafa', '#000000');
      doc.fillColor('#000000').fontSize(7.5).font('Helvetica-Bold');

      doc.text('Cód', x, y + 4, { width: colW.cod, align: 'center' });
      doc.text('Descrição do Aparelho (Marca, Modelo, Capacidade, Cor, IMEI)', x + colW.cod + 4, y + 4, {
        width: colW.desc,
      });
      doc.text('Qtd', x + colW.cod + colW.desc, y + 4, { width: colW.qtd, align: 'center' });
      doc.text('Valor Unit.', x + colW.cod + colW.desc + colW.qtd, y + 4, { width: colW.unit, align: 'right' });
      doc.text('Desconto', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 4, {
        width: colW.descVal,
        align: 'right',
      });
      doc.text('Valor Total', x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal, y + 4, {
        width: colW.tot - 4,
        align: 'right',
      });
      y += 15;

      // Linhas dos Itens Vendidos (suporta 1 ou múltiplos aparelhos)
      const listaItensPdf =
        Array.isArray(dados.itens) && dados.itens.length > 0 ? dados.itens : [dados.aparelho];
      const altLinhaItem = listaItensPdf.length > 1 ? 28 : 34;

      listaItensPdf.forEach((itemAp, idxItem) => {
        doc.rect(x, y, w, altLinhaItem).stroke('#000000');

        doc.fillColor('#000000').fontSize(8).font('Helvetica');
        doc.text(String(idxItem + 1), x, y + 6, { width: colW.cod, align: 'center' });

        const batTxt = (itemAp as any).bateria ? ` (Bat: ${(itemAp as any).bateria}%)` : '';
        const obsTxt = (itemAp as any).observacao ? ` - ${(itemAp as any).observacao}` : '';
        const modCompleto = limparTextoPdf(
          `${itemAp.modelo} ${itemAp.capacidade || ''} ${itemAp.cor || ''}${batTxt}${obsTxt}`
        );

        doc.fontSize(8.5).font('Helvetica-Bold');
        doc.text(modCompleto, x + colW.cod + 4, y + 4, { width: colW.desc - 6, ellipsis: true });

        if (itemAp.imei) {
          doc.fontSize(7.5).font('Helvetica-Bold');
          doc.text(`IMEI / Serial: ${limparTextoPdf(itemAp.imei)}`, x + colW.cod + 4, y + (altLinhaItem > 30 ? 18 : 15), {
            width: colW.desc - 6,
          });
        }

        doc.fontSize(8).font('Helvetica');
        doc.text('1', x + colW.cod + colW.desc, y + 8, { width: colW.qtd, align: 'center' });
        doc.text(formatarMoeda(itemAp.valor), x + colW.cod + colW.desc + colW.qtd, y + 8, {
          width: colW.unit,
          align: 'right',
        });
        doc.text('R$ 0,00', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 8, {
          width: colW.descVal,
          align: 'right',
        });

        doc.fontSize(8.5).font('Helvetica-Bold');
        doc.text(
          formatarMoeda(itemAp.valor),
          x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal,
          y + 8,
          {
            width: colW.tot - 4,
            align: 'right',
          }
        );
        y += altLinhaItem;
      });

      // Linhas especiais de Trade-In (se houver 1 ou múltiplos upgrades)
      const listaUpgradesPdf =
        Array.isArray(dados.upgrades) && dados.upgrades.length > 0
          ? dados.upgrades
          : dados.upgrade && dados.upgrade.ativo && (dados.upgrade.valor || dados.upgrade.modelo)
          ? [
              {
                modelo: dados.upgrade.modelo || 'Aparelho na Troca',
                capacidade: null,
                cor: null,
                imei: dados.upgrade.imei || null,
                valor: dados.upgrade.valor || null,
              },
            ]
          : [];

      const temUpgrade = Boolean(
        (dados.upgrade && dados.upgrade.ativo && (dados.upgrade.valor || dados.upgrade.modelo)) ||
          listaUpgradesPdf.length > 0
      );

      if (temUpgrade) {
        const altLinhaTroca = listaUpgradesPdf.length > 1 ? 26 : 32;

        listaUpgradesPdf.forEach((trItem, idxTr) => {
          doc.rect(x, y, w, altLinhaTroca).fillAndStroke('#f0fdf4', '#000000');

          const codTrocaLabel = listaUpgradesPdf.length > 1 ? `TR${idxTr + 1}` : 'TR';
          doc.fillColor('#166534').fontSize(7.5).font('Helvetica-Bold');
          doc.text(codTrocaLabel, x, y + 8, { width: colW.cod, align: 'center' });

          doc.fontSize(7).font('Helvetica-Bold');
          const labelEntrada =
            listaUpgradesPdf.length > 1
              ? `ENTRADA #${idxTr + 1}: APARELHO RECEBIDO NA TROCA (UPGRADE)`
              : 'ENTRADA: APARELHO RECEBIDO NA TROCA (UPGRADE)';
          doc.text(labelEntrada, x + colW.cod + 4, y + 3, { width: colW.desc - 6 });

          const descTroca = limparTextoPdf(
            `${trItem.modelo || 'Aparelho na Troca'}${trItem.capacidade ? ` ${trItem.capacidade}` : ''}${trItem.cor ? ` ${trItem.cor}` : ''}${trItem.imei ? ` (IMEI: ${trItem.imei})` : ''}`
          );
          doc.fillColor('#000000').fontSize(7.5).font('Helvetica');
          doc.text(descTroca, x + colW.cod + 4, y + (altLinhaTroca > 28 ? 15 : 13), {
            width: colW.desc - 6,
            ellipsis: true,
          });

          doc.text('1', x + colW.cod + colW.desc, y + 8, { width: colW.qtd, align: 'center' });

          const valTrNum = Number(trItem.valor || 0);
          const valTrocaFmt = valTrNum > 0 ? `- ${formatarMoeda(valTrNum)}` : 'Incluso na Volta';
          doc.fillColor('#166534').fontSize(valTrNum > 0 ? 8 : 7).font('Helvetica-Bold');
          doc.text(valTrocaFmt, x + colW.cod + colW.desc + colW.qtd, y + 8, { width: colW.unit, align: 'right' });
          doc.text('-', x + colW.cod + colW.desc + colW.qtd + colW.unit, y + 8, {
            width: colW.descVal,
            align: 'center',
          });
          doc.text(valTrocaFmt, x + colW.cod + colW.desc + colW.qtd + colW.unit + colW.descVal, y + 8, {
            width: colW.tot - 4,
            align: 'right',
          });
          y += altLinhaTroca;
        });

        const valorEntradaTotal = Number(dados.upgrade?.valor || dados.pagamento.valorEntrada || 0);
        if (valorEntradaTotal > 0) {
          // Subtotais de Upgrade quando há valor explícito da avaliação de entrada
          doc.rect(x, y, w, 15).stroke('#000000');
          doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold');
          doc.text('SUBTOTAL (APARELHO ADQUIRIDO)', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
          doc.text(formatarMoeda(dados.pagamento.valorTotal), x + w - colW.tot, y + 4, {
            width: colW.tot - 4,
            align: 'right',
          });
          y += 15;

          doc.rect(x, y, w, 15).stroke('#000000');
          doc.fillColor('#166534').fontSize(7.5).font('Helvetica-Bold');
          doc.text('(-) ENTRADA BASE DE TROCA (UPGRADE)', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
          doc.text(`- ${formatarMoeda(valorEntradaTotal)}`, x + w - colW.tot, y + 4, {
            width: colW.tot - 4,
            align: 'right',
          });
          y += 15;
        }

        doc.rect(x, y, w, 16).fillAndStroke('#fafafa', '#000000');
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
        doc.text('(=) TOTAL LÍQUIDO PAGO / VOLTA', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(formatarMoeda(dados.pagamento.valorFinal), x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 16;
      } else {
        // Venda sem upgrade - Total Direto
        doc.rect(x, y, w, 16).stroke('#000000');
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
        doc.text('TOTAL DA VENDA', x, y + 4, { width: w - colW.tot - 8, align: 'right' });
        doc.text(formatarMoeda(dados.pagamento.valorTotal), x + w - colW.tot, y + 4, {
          width: colW.tot - 4,
          align: 'right',
        });
        y += 16;
      }

      y += 8;

      // ─────────────────────────────────────────────────────────────
      // 5. FORMA(S) DE PAGAMENTO & STATUS
      // ─────────────────────────────────────────────────────────────
      doc.rect(x, y, w, 14).fillAndStroke('#f0f0f0', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('FORMA(S) DE PAGAMENTO & STATUS', x, y + 3, { align: 'center', width: w });
      y += 14;

      doc.rect(x, y, w, 22).fillAndStroke('#fafafa', '#000000');
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text('Forma(s) de Pagamento: ', x + 10, y + 6, { continued: true });
      doc.font('Helvetica-Bold').text(limparTextoPdf(dados.pagamento.forma).toUpperCase() || 'PIX');

      doc.fontSize(8).font('Helvetica-Bold').fillColor('#16a34a');
      doc.text('Status: PAGO / CONCLUÍDO', x + 350, y + 6, { align: 'right', width: 175 });

      y += 28;

      // ─────────────────────────────────────────────────────────────
      // 6. TERMO DE GARANTIA (Texto oficial de reciboA4.ts)
      // ─────────────────────────────────────────────────────────────
      const diasGar = dados.diasGarantia || 90;
      doc.rect(x, y, w, 92).stroke('#000000');

      doc.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold');
      doc.text('TERMO DE GARANTIA', x + 10, y + 8);

      doc.fontSize(7.5).font('Helvetica');
      doc.text(
        `Garantia de ${diasGar} dias a partir da data da compra. Válida somente para serviços e peças fornecidos pela empresa.`,
        x + 10,
        y + 22
      );
      doc.text('Esta garantia não cobre:', x + 10, y + 33);

      doc.text('• Queda, umidade, líquidos ou danos acidentais;', x + 18, y + 43);
      doc.text('• Uso indevido, instalação incorreta ou violação do produto;', x + 18, y + 53);
      doc.text('• Abertura ou tentativa de conserto por terceiros não autorizados;', x + 18, y + 63);
      doc.text('• Não pode molhar e não pode abrir o aparelho.', x + 18, y + 73);

      doc.fontSize(7.5).font('Helvetica-Bold');
      doc.text('Apresente este recibo junto com o equipamento no atendimento.', x + 10, y + 84);

      y += 104;

      // ─────────────────────────────────────────────────────────────
      // 7. ASSINATURAS (CLIENTE E LOJA)
      // ─────────────────────────────────────────────────────────────
      y = Math.min(y + 48, 730);

      if (assinaturaBuffer) {
        try {
          doc.image(assinaturaBuffer, x + 335, y - 44, {
            fit: [140, 42],
            align: 'center',
            valign: 'bottom',
          });
        } catch (errAss) {
          console.warn('[gerarReciboPdfBuffer] Falha ao inserir assinatura da loja no PDF:', errAss);
        }
      }

      doc.strokeColor('#000000').lineWidth(1);
      doc.moveTo(x + 40, y).lineTo(x + 220, y).stroke();
      doc.moveTo(x + 315, y).lineTo(x + 495, y).stroke();

      doc.fillColor('#000000').fontSize(8).font('Helvetica-Bold');
      doc.text('Assinatura do Cliente', x + 40, y + 5, { width: 180, align: 'center' });
      doc.fontSize(7.5).font('Helvetica');
      doc.text(nomeCliente, x + 40, y + 15, { width: 180, align: 'center' });

      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Assinatura / Carimbo da Loja', x + 315, y + 5, { width: 180, align: 'center' });
      doc.fontSize(7.5).font('Helvetica');
      doc.text(nomeLoja, x + 315, y + 15, { width: 180, align: 'center' });

      // ─────────────────────────────────────────────────────────────
      // 8. RODAPÉ DE AGRADECIMENTO & LINK PÚBLICO
      // ─────────────────────────────────────────────────────────────
      doc.fontSize(9).font('Helvetica-Bold');
      doc.text('OBRIGADO PELA PREFERÊNCIA!', x, y + 35, { align: 'center', width: w });

      if (dados.linkRecibo) {
        doc.fillColor('#64748b').fontSize(7).font('Helvetica');
        doc.text(`Recibo Digital e Validação: ${dados.linkRecibo}`, x, 792, { align: 'center', width: w });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
