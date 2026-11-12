import { extrairCorDeTexto } from '@/lib/vendas/parseVendaTexto';
import type { ItemListaImportada } from './remontagem';

export interface ItemListaSimples extends ItemListaImportada {
  marca: string;
  condicao: 'novo' | 'seminovo';
  bateria: string;
  observacoes: string;
  custo: number;
  preco: number;
  isCellular: boolean;
}

export interface OpcoesParseListaSimples {
  aceitarPrefixoCusto?: boolean;
  aceitarCustoSemRS?: boolean;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extrairNumeroMonetario(valStr: string): number {
  if (!valStr) return 0;
  const limpo = valStr.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(limpo);
  return Number.isNaN(num) ? 0 : num;
}

export function extractAparelhoBrandModelAndColor(str: string): {
  marca: string;
  modelo: string;
  cor: string;
} {
  const cleanStr = str.replace(/[\s\u00A0\u200B\u200E]+/g, ' ').trim();

  // 1. MACBOOKS & NOTEBOOKS (Apple)
  if (/\bmacbook\b/i.test(cleanStr) || /\bmac\s*book\b/i.test(cleanStr)) {
    const matchMac = cleanStr.match(/\b(macbook\s*(?:pro|air)?(?:\s*(?:m1|m2|m3|m4)(?:\s*(?:pro|max))?|\s*\d{2,2}")?)\b/i);
    const modelo = matchMac ? matchMac[0].replace(/\bmacbook\b/i, 'MacBook').trim() : 'MacBook';
    const cor = cleanStr.replace(matchMac ? matchMac[0] : /macbook/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
    return { marca: 'Apple', modelo, cor };
  }

  // 2. IPADS / TABLETS (Apple / Samsung)
  if (/\bipad\b/i.test(cleanStr)) {
    const matchIpad = cleanStr.match(/\b(ipad\s*(?:pro|air|mini)?(?:\s*\d{1,2})?(?:\s*geração|\s*gen)?)\b/i);
    const modelo = matchIpad ? matchIpad[0].replace(/\bipad\b/i, 'iPad').trim() : 'iPad';
    const cor = cleanStr.replace(matchIpad ? matchIpad[0] : /ipad/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
    return { marca: 'Apple', modelo, cor };
  }

  // 3. APPLE WATCH (Apple)
  if (/\bwatch\b/i.test(cleanStr) || /\bapple\s*watch\b/i.test(cleanStr)) {
    const matchWatch =
      cleanStr.match(/\b(apple\s*watch\s*(?:ultra\s*2|ultra|series\s*\d|se)?)\b/i) ||
      cleanStr.match(/\b(watch\s*(?:ultra\s*2|ultra|series\s*\d|se)?)\b/i);
    const modelo = matchWatch ? matchWatch[0].replace(/\bwatch\b/i, 'Watch').trim() : 'Apple Watch';
    const cor = cleanStr.replace(matchWatch ? matchWatch[0] : /watch/gi, '').replace(/\bapple\b/gi, '').trim() || 'Padrão';
    return { marca: 'Apple', modelo: modelo.startsWith('Apple') ? modelo : `Apple ${modelo}`, cor };
  }

  // 4. AIRPODS & FONES (Apple)
  if (/\bairpods\b/i.test(cleanStr) || /\bairpod\b/i.test(cleanStr)) {
    const matchPods = cleanStr.match(/\b(airpods\s*(?:pro\s*2|pro|max|\d)?)\b/i);
    const modelo = matchPods ? matchPods[0] : 'AirPods';
    const cor = cleanStr.replace(matchPods ? matchPods[0] : /airpods/gi, '').replace(/\bapple\b/gi, '').trim() || 'Branco';
    return { marca: 'Apple', modelo: `Apple ${modelo}`, cor };
  }

  // 5. CONSOLES DE VIDEO GAME (Sony PS5/PS4, Microsoft Xbox, Nintendo Switch)
  if (/\b(ps5|ps4|playstation)\b/i.test(cleanStr)) {
    const matchPs = cleanStr.match(/\b(playstation\s*5\s*(?:slim|pro|digital)?|ps5\s*(?:slim|pro|digital)?|playstation\s*4\s*(?:slim|pro)?|ps4\s*(?:slim|pro)?)\b/i);
    const modelo = matchPs ? matchPs[0].toUpperCase().replace('PLAYSTATION', 'PlayStation') : 'PlayStation 5';
    const cor = cleanStr.replace(matchPs ? matchPs[0] : /ps5|ps4|playstation/gi, '').replace(/\bsony\b/gi, '').trim() || 'Branco';
    return { marca: 'Sony', modelo, cor };
  }

  if (/\bxbox\b/i.test(cleanStr)) {
    const matchXbox = cleanStr.match(/\b(xbox\s*(?:series\s*x|series\s*s|one\s*s|one\s*x|one)?)\b/i);
    const modelo = matchXbox ? matchXbox[0].replace(/xbox/i, 'Xbox') : 'Xbox';
    const cor = cleanStr.replace(matchXbox ? matchXbox[0] : /xbox/gi, '').replace(/\bmicrosoft\b/gi, '').trim() || 'Padrão';
    return { marca: 'Microsoft', modelo, cor };
  }

  if (/\b(nintendo|switch)\b/i.test(cleanStr)) {
    const matchSwitch = cleanStr.match(/\b(nintendo\s*switch\s*(?:oled|lite)?|switch\s*(?:oled|lite)?)\b/i);
    const modelo = matchSwitch ? matchSwitch[0].replace(/nintendo/i, 'Nintendo').replace(/switch/i, 'Switch') : 'Nintendo Switch';
    const cor = cleanStr.replace(matchSwitch ? matchSwitch[0] : /nintendo|switch/gi, '').trim() || 'Padrão';
    return { marca: 'Nintendo', modelo, cor };
  }

  // 6. ANDROID (Samsung, Xiaomi/Redmi/Poco, Motorola)
  if (/\b(samsung|galaxy)\b/i.test(cleanStr)) {
    const matchSam = cleanStr.match(/\b(galaxy\s*[a-z0-9\s+]+)\b/i);
    const modelo = matchSam ? matchSam[0] : 'Galaxy';
    const cor = cleanStr.replace(matchSam ? matchSam[0] : /samsung|galaxy/gi, '').trim() || 'Padrão';
    return { marca: 'Samsung', modelo: modelo.startsWith('Galaxy') ? modelo : `Galaxy ${modelo}`, cor };
  }

  if (/\b(xiaomi|redmi|poco)\b/i.test(cleanStr)) {
    const matchXio = cleanStr.match(/\b((?:redmi\s*note|redmi|poco|xiaomi)\s*[a-z0-9\s+]+)\b/i);
    const modelo = matchXio ? matchXio[0] : 'Xiaomi';
    const cor = cleanStr.replace(matchXio ? matchXio[0] : /xiaomi|redmi|poco/gi, '').trim() || 'Padrão';
    return { marca: 'Xiaomi', modelo, cor };
  }

  if (/\b(motorola|moto)\b/i.test(cleanStr)) {
    const matchMoto = cleanStr.match(/\b((?:moto|edge)\s*[a-z0-9\s+]+)\b/i);
    const modelo = matchMoto ? matchMoto[0] : 'Motorola';
    const cor = cleanStr.replace(matchMoto ? matchMoto[0] : /motorola|moto/gi, '').trim() || 'Padrão';
    return { marca: 'Motorola', modelo, cor };
  }

  // 7. IPHONES (Suporte dinâmico para 11..20+ e sufixos Pro Max / Pro / Plus / Mini / Air / e)
  const nonAppleBrandRegex =
    /\b(samsung|galaxy|xiaomi|redmi|poco|motorola|moto|realme|infinix|oppo|oneplus|asus|google|pixel|nokia|huawei|honor|sony|microsoft|nintendo)\b/i;

  if (!nonAppleBrandRegex.test(cleanStr)) {
    const specialIphones = [
      { regex: /\b(?:iphone\s*)?air\b/i, name: 'iPhone Air' },
      { regex: /\b(?:iphone\s*)?se\s*4\b/i, name: 'iPhone SE 4' },
      { regex: /\b(?:iphone\s*)?se\s*3\b/i, name: 'iPhone SE 3' },
      { regex: /\b(?:iphone\s*)?se\s*2\b/i, name: 'iPhone SE 2' },
      { regex: /\b(?:iphone\s*)?se\b/i, name: 'iPhone SE' },
      { regex: /\b(?:iphone\s*)?xs\s*max\b/i, name: 'iPhone XS Max' },
      { regex: /\b(?:iphone\s*)?xs\b/i, name: 'iPhone XS' },
      { regex: /\b(?:iphone\s*)?xr\b/i, name: 'iPhone XR' },
      { regex: /\b(?:iphone\s*)?x\b/i, name: 'iPhone X' },
      { regex: /\b(?:iphone\s*)?6s\s*plus\b/i, name: 'iPhone 6s Plus' },
      { regex: /\b(?:iphone\s*)?6s\b/i, name: 'iPhone 6s' },
      { regex: /\b(?:iphone\s*)?6\s*plus\b/i, name: 'iPhone 6 Plus' },
      { regex: /\b(?:iphone\s*)?6\b/i, name: 'iPhone 6' },
      { regex: /\b(?:iphone\s*)?5s\b/i, name: 'iPhone 5s' },
      { regex: /\b(?:iphone\s*)?5c\b/i, name: 'iPhone 5c' },
      { regex: /\b(?:iphone\s*)?5\b/i, name: 'iPhone 5' },
    ];

    for (const p of specialIphones) {
      if (p.regex.test(cleanStr)) {
        const rest = cleanStr.replace(p.regex, '').replace(/iphone/gi, '').replace(/\bapple\b/gi, '').trim();
        return {
          marca: 'Apple',
          modelo: p.name,
          cor: rest || 'Padrão',
        };
      }
    }

    const matchNumIphone = cleanStr.match(/\b(?:iphone\s*)?(\d{1,2})\s*(pm|promax|pro\s*max|pro|plus|mini|air|p|e)?\b/i);
    if (matchNumIphone) {
      const num = matchNumIphone[1];
      const rawVariant = (matchNumIphone[2] || '').toLowerCase().replace(/\s+/g, '');
      let variant = '';
      if (rawVariant === 'pm' || rawVariant === 'promax') {
        variant = ' Pro Max';
      } else if (rawVariant === 'pro' || rawVariant === 'p') {
        variant = ' Pro';
      } else if (rawVariant === 'plus') {
        variant = ' Plus';
      } else if (rawVariant === 'mini') {
        variant = ' Mini';
      } else if (rawVariant === 'air') {
        variant = ' Air';
      } else if (rawVariant === 'e') {
        variant = 'e';
      }

      const modelName = `iPhone ${num}${variant}`;
      const rest = cleanStr.replace(matchNumIphone[0], '').replace(/iphone/gi, '').replace(/\bapple\b/gi, '').trim();
      return {
        marca: 'Apple',
        modelo: modelName,
        cor: rest || 'Padrão',
      };
    }
  }

  const parts = cleanStr.split(' ');
  const modelo = parts.slice(0, 2).join(' ') || 'Eletrônico';
  const cor = parts.slice(2).join(' ') || 'Padrão';
  return {
    marca: 'Outros',
    modelo,
    cor,
  };
}

/**
 * Parser oficial da Lista Simples (Importar > Lista Simples) e das listas de entrada do bot.
 * Garante que o sufixo após "-" (ex: "- 2605", "- 5177") e IMEIs de 14-16 dígitos
 * sejam sempre tratados como IMEI/serial e nunca confundidos com valor/custo.
 */
export function parseMercadoPhoneList(
  rawText: string,
  margemAdicional: number = 0,
  opcoes: OpcoesParseListaSimples = {}
): ItemListaSimples[] {
  const lines = rawText.split('\n');
  const aparelhosFormatados: ItemListaSimples[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.length < 3) continue;
    if (/^entradas?:?$/i.test(line) || /^dar entradas?:?$/i.test(line) || /novos lacrados/i.test(line) || /semi\s*novos/i.test(line)) {
      continue;
    }

    let idEtiqueta = '';
    let idEtiquetaInformado = false;
    const matchIdEnd = line.match(/\|?\s*ID:\s*(\d{6,10})/i);
    const matchId = line.match(/^(\d{6,8})\s*[-?:]?\s*/);

    if (matchIdEnd) {
      idEtiqueta = matchIdEnd[1];
      idEtiquetaInformado = true;
      line = line.replace(matchIdEnd[0], '').trim();
      if (matchId) line = line.replace(matchId[0], '').trim();
    } else if (matchId) {
      idEtiqueta = matchId[1];
      idEtiquetaInformado = true;
      line = line.replace(matchId[0], '').trim();
    } else {
      idEtiqueta = String(Math.floor(10000000 + Math.random() * 90000000));
    }

    let mainPart = line;
    let sufixoSerial = '';
    if (line.includes('-')) {
      const parts = line.split('-');
      mainPart = parts[0].trim();
      sufixoSerial = parts.slice(1).join('-').trim();
    }

    // Extração explícita de IMEI no corpo principal (ex: "imei: 356829104829102" ou 14-16 dígitos)
    let imeiExplicito = '';
    const imeiPrefixoMatch = mainPart.match(/(?:imei|serial|sn)[:\s=]*([0-9\s-]{14,18})/i);
    if (imeiPrefixoMatch) {
      const limpo = imeiPrefixoMatch[1].replace(/\D/g, '');
      if (limpo.length >= 14 && limpo.length <= 16) {
        imeiExplicito = limpo;
        mainPart = mainPart.replace(imeiPrefixoMatch[0], ' ').trim();
      }
    }
    if (!imeiExplicito) {
      const imeiDiretoMatch = mainPart.match(/\b(\d{14,16})\b/);
      if (imeiDiretoMatch) {
        imeiExplicito = imeiDiretoMatch[1];
        mainPart = mainPart.replace(imeiDiretoMatch[0], ' ').trim();
      }
    }

    const observacoesPartes: string[] = [];

    // Detecção de quantidade (ex: 2 unidades, 3 un, 2x)
    let quantidade = 1;
    const matchQtd =
      mainPart.match(/\((\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)[^)]*\)/i) ||
      mainPart.match(/\b(\d+)\s*(?:unidades|unidade|unid|un|peças|pecas)\b/i) ||
      mainPart.match(/\b(\d+)x\b/i) ||
      rawLine.match(/\((\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)[^)]*\)/i);
    if (matchQtd) {
      quantidade = parseInt(matchQtd[1], 10) || 1;
      mainPart = mainPart.replace(matchQtd[0], '').trim();
    }

    // Observações entre parênteses (ex: (PIXEL NA TELA), (COM CAIXA))
    const matchParenteses = mainPart.match(/\(([^)]+)\)/g);
    if (matchParenteses) {
      matchParenteses.forEach((p) => {
        if (!/\b(\d+)\s*(?:unidades|unidade|unid|un|peças|pecas|x)\b/i.test(p)) {
          const obsInterna = p.replace(/[()]/g, '').trim();
          if (obsInterna && !observacoesPartes.includes(obsInterna)) {
            observacoesPartes.push(obsInterna);
          }
          mainPart = mainPart.replace(p, '').trim();
        }
      });
    }

    let bateria = '';
    let condicao: 'novo' | 'seminovo' = 'seminovo';
    if (
      mainPart.toLowerCase().includes('lacrado') ||
      sufixoSerial.toLowerCase().includes('lacrado') ||
      rawLine.toLowerCase().includes('lacrado')
    ) {
      condicao = 'novo';
      bateria = '100% (Lacrado)';
      mainPart = mainPart.replace(/lacrado/gi, '').trim();
    } else {
      const matchBat = mainPart.match(/(\d{2,3})%/);
      if (matchBat) {
        bateria = `${matchBat[1]}%`;
        mainPart = mainPart.replace(matchBat[0], '').trim();
      }
    }

    let capacidade = '';
    const matchRom = mainPart.match(/(\d+gb|\d+tb)\b/i);
    if (matchRom) {
      capacidade = matchRom[1].toUpperCase();
      mainPart = mainPart.replace(matchRom[0], '').trim();
    }

    let custoNumerico = 0;
    const matchCustoExplicit = mainPart.match(/R\$\s*([\d.,]+)/i);
    if (matchCustoExplicit) {
      custoNumerico = extrairNumeroMonetario(matchCustoExplicit[1]);
      mainPart = mainPart.replace(matchCustoExplicit[0], '').trim();
    } else if (opcoes.aceitarPrefixoCusto) {
      const matchPrefixo = mainPart.match(/(?:custo|por|valor|pre[çc]o|pago)[:=\s]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\b\d{3,6}\b)/i);
      if (matchPrefixo) {
        const num = extrairNumeroMonetario(matchPrefixo[1]);
        if (num >= 50 && ![32, 64, 128, 256, 512, 1024].includes(num)) {
          custoNumerico = num;
          mainPart = mainPart.replace(matchPrefixo[0], ' ').trim();
        }
      }
    }

    // Só aceita número solto como custo se NÃO houver sufixo "-" (que é IMEI) nem IMEI explícito
    if (custoNumerico === 0 && opcoes.aceitarCustoSemRS && !sufixoSerial && !imeiExplicito) {
      const matchCentavos = mainPart.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/);
      const matchSolto = mainPart.match(/(?:^|\s)(\d{3,5})(?:\s|$)/);
      if (matchCentavos) {
        const num = extrairNumeroMonetario(matchCentavos[1]);
        if (num >= 50) {
          custoNumerico = num;
          mainPart = mainPart.replace(matchCentavos[0], ' ').trim();
        }
      } else if (matchSolto) {
        const num = extrairNumeroMonetario(matchSolto[1]);
        if (num >= 50 && ![32, 64, 128, 256, 512, 1024].includes(num)) {
          custoNumerico = num;
          mainPart = mainPart.replace(matchSolto[0], ' ').trim();
        }
      }
    }

    // Limpa palavras auxiliares e emojis de entrada antes de extrair marca/modelo/cor
    const mainSemEmojis = mainPart
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const { marca: marcaExtraida, modelo, cor: corExtraida } = extractAparelhoBrandModelAndColor(mainSemEmojis);

    const isNonCellular =
      (/\b(macbook|mac\s*book|ps5|ps4|playstation|xbox|nintendo|switch|pencil|airpods|airpod|ipad|tablet)\b/i.test(mainPart) ||
        /\b(macbook|mac\s*book|ps5|ps4|playstation|xbox|nintendo|switch|pencil|airpods|airpod|ipad|tablet)\b/i.test(modelo) ||
        ['Sony', 'Microsoft', 'Nintendo'].includes(marcaExtraida)) &&
      !/\biphone\b/i.test(modelo);

    let imeiLimpo = '';
    if (sufixoSerial && !isNonCellular) {
      const matchSerialWithObs = sufixoSerial.match(/^([A-Za-z0-9]{3,16})\s+(.+)$/);
      if (matchSerialWithObs) {
        imeiLimpo = matchSerialWithObs[1].trim();
        const obsTxt = matchSerialWithObs[2].trim();
        if (obsTxt && !observacoesPartes.includes(obsTxt)) {
          observacoesPartes.push(obsTxt);
        }
      } else {
        imeiLimpo = sufixoSerial.trim();
      }
    } else if (sufixoSerial && isNonCellular) {
      const cleanObs = sufixoSerial.replace(/lacrado/gi, '').trim();
      if (cleanObs && !observacoesPartes.includes(cleanObs)) {
        observacoesPartes.push(cleanObs);
      }
    }

    const finalImei = isNonCellular ? '' : (imeiLimpo || imeiExplicito);

    const regexObsKeywords =
      /\b(msg\s*degradada|msgdegradada|msg\s*bateria|msgbateria|msg\s*bat|msg\s*tela|msg\s*camera|msg\s*peça|msg\s*peca|traseira\s*[\w\s]*|tampa\s*[\w\s]*|tela\s*trocada|trincad[oa]|detalhe|face\s*id\s*off|pixel\s*na\s*tela|risco\s*na\s*tela|mancha\s*na\s*tela)\b/gi;

    const matchesObsCor = corExtraida.match(regexObsKeywords);
    if (matchesObsCor) {
      matchesObsCor.forEach((obs) => {
        if (!observacoesPartes.includes(obs.trim())) {
          observacoesPartes.push(obs.trim());
        }
      });
    }

    const matchesObsMain = mainPart.match(regexObsKeywords);
    if (matchesObsMain) {
      matchesObsMain.forEach((obs) => {
        if (!observacoesPartes.includes(obs.trim())) {
          observacoesPartes.push(obs.trim());
        }
      });
    }

    let corFinal = corExtraida;
    observacoesPartes.forEach((obs) => {
      if (obs) {
        corFinal = corFinal.replace(new RegExp(escapeRegExp(obs), 'gi'), '');
      }
    });
    corFinal = corFinal
      .replace(/lacrado/gi, '')
      .replace(/\b\d+%\b/g, '')
      .replace(/[()]/g, '')
      .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
      .trim();

    // Fallback de cor por emoji ou termo conhecido (ex: 🏜️ -> Desert, 🖤 -> Preto)
    const corDetectadaEmoji = extrairCorDeTexto(corFinal) || extrairCorDeTexto(rawLine);
    const cor =
      corFinal && corFinal.toLowerCase() !== 'padrão'
        ? extrairCorDeTexto(corFinal) || corFinal
        : corDetectadaEmoji || 'Padrão';

    const observacoes = observacoesPartes.join(' | ');
    const precoVenda = custoNumerico > 0 ? custoNumerico + margemAdicional : margemAdicional;

    for (let q = 0; q < quantidade; q++) {
      const idUnico = q === 0 ? idEtiqueta : String(Math.floor(10000000 + Math.random() * 90000000));
      aparelhosFormatados.push({
        raw: rawLine,
        idEtiqueta: idUnico,
        idEtiquetaInformado: q === 0 ? idEtiquetaInformado : false,
        marca: marcaExtraida || 'Apple',
        modelo,
        capacidade: capacidade || (marcaExtraida === 'Apple' && modelo.includes('iPhone') ? '128GB' : ''),
        cor,
        condicao,
        bateria,
        sufixoSerial: finalImei,
        observacoes,
        custo: custoNumerico,
        preco: precoVenda,
        isCellular: !isNonCellular,
      });
    }
  }

  return aparelhosFormatados;
}
