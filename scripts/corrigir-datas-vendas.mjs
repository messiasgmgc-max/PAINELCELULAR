#!/usr/bin/env node
/**
 * Corrige as datas das vendas importadas que ficaram com o dia trocado pelo mês.
 *
 * O arquivo importado estava em MM/DD/AAAA e foi lido como DD/MM/AAAA. Quando os
 * dois componentes são <= 12 o erro passa despercebido (05/08 vira 08/05);
 * quando o dia é > 12 o mês "estoura" e a venda é jogada para o futuro.
 *
 * A data correta vem do CSV original, casando cada venda por
 * (nome do cliente + valor). Só altera quando a data do banco é EXATAMENTE o
 * que a troca dia/mês produziria a partir da data do CSV — qualquer divergência
 * por outro motivo é deixada em paz e reportada.
 *
 * Uso:
 *   node scripts/corrigir-datas-vendas.mjs <arquivo.csv> "<Nome da Loja>"
 *   node scripts/corrigir-datas-vendas.mjs <arquivo.csv> "<Nome da Loja>" --aplicar
 *
 * Sem --aplicar não grava nada: apenas mostra o que faria.
 */
import fs from 'node:fs';
import process from 'node:process';

const [, , caminhoCsv, nomeLoja, ...flags] = process.argv;
const APLICAR = flags.includes('--aplicar');

if (!caminhoCsv || !nomeLoja) {
  console.error('Uso: node scripts/corrigir-datas-vendas.mjs <arquivo.csv> "<Nome da Loja>" [--aplicar]');
  process.exit(1);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const cabecalhos = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function api(caminho, init) {
  const res = await fetch(URL + caminho, { ...init, headers: { ...cabecalhos, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Parser de CSV que respeita aspas e vírgulas dentro do campo. */
function lerCsv(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') dentroDeAspas = false;
      else campo += c;
    } else if (c === '"') dentroDeAspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.length > 3);
}

/** Reproduz `new Date(ano, mes-1, dia)` do JS, com o rollover de mês. */
function dataComRollover(ano, mes, dia) {
  const total = ano * 12 + (mes - 1);
  const a = Math.floor(total / 12);
  const m = total - a * 12;
  const d = new Date(Date.UTC(a, m, dia));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const linhas = lerCsv(fs.readFileSync(caminhoCsv, 'utf8'));
console.log(`CSV: ${linhas.length} linhas`);

const lojas = await api(`/rest/v1/lojas?select=id,nome`);
const loja = lojas.find((l) => (l.nome || '').trim() === nomeLoja.trim());
if (!loja) {
  console.error(`Loja "${nomeLoja}" não encontrada. Disponíveis: ${lojas.map((l) => `"${l.nome}"`).join(', ')}`);
  process.exit(1);
}

const vendas = [];
for (let pagina = 0; ; pagina += 1) {
  const lote = await api(
    `/rest/v1/vendas?select=id,dataPagamento,clienteNome,valor&loja_id=eq.${loja.id}&limit=1000&offset=${pagina * 1000}`
  );
  vendas.push(...lote);
  if (lote.length < 1000) break;
}
console.log(`Banco: ${vendas.length} vendas na loja "${loja.nome.trim()}"\n`);

// Índice do CSV por (cliente, valor); cada linha é consumida uma única vez.
const porChave = new Map();
for (const l of linhas) {
  const chave = `${(l[1] || '').trim().toUpperCase()}|${Number(l[10] || 0).toFixed(2)}`;
  if (!porChave.has(chave)) porChave.set(chave, []);
  porChave.get(chave).push(l);
}

const correcoes = [];
let jaCorretas = 0;
let semPar = 0;
let divergentes = 0;

for (const v of vendas) {
  const chave = `${(v.clienteNome || '').trim().toUpperCase()}|${Number(v.valor || 0).toFixed(2)}`;
  const fila = porChave.get(chave);
  if (!fila || fila.length === 0) { semPar += 1; continue; }

  const atual = String(v.dataPagamento || '').slice(0, 10);

  const dataDaLinha = (l) => {
    const d = (l[2] || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };

  // Um cliente com várias compras do mesmo valor (revendedor, por exemplo) tem
  // várias linhas candidatas. Escolher pela ordem do arquivo erra o par; a data
  // já trocada é uma chave muito mais forte, então casamos por ela primeiro.
  let indice = fila.findIndex((l) => {
    const real = dataDaLinha(l);
    if (!real) return false;
    const [a, m, d] = real.split('-').map(Number);
    return dataComRollover(a, d, m) === atual;
  });

  let viaTroca = indice >= 0;
  if (!viaTroca) indice = fila.findIndex((l) => dataDaLinha(l) === atual);
  if (indice < 0) indice = 0;

  const linha = fila.splice(indice, 1)[0];
  const real = dataDaLinha(linha);
  if (!real) { semPar += 1; continue; }

  if (atual === real) { jaCorretas += 1; continue; }

  if (viaTroca) {
    correcoes.push({ id: v.id, de: atual, para: real, cliente: v.clienteNome, valor: v.valor });
  } else {
    divergentes += 1;
  }
}

console.log(`  já corretas                    : ${jaCorretas}`);
console.log(`  A CORRIGIR (dia/mês trocados)  : ${correcoes.length}`);
console.log(`  divergentes por outro motivo   : ${divergentes}  (não serão tocadas)`);
console.log(`  sem par no CSV                 : ${semPar}  (não serão tocadas)\n`);

console.log('Amostra das correções:');
for (const c of correcoes.slice(0, 10)) {
  console.log(`  ${c.de} -> ${c.para}   ${String(c.cliente).slice(0, 30)}`);
}

if (!APLICAR) {
  console.log(`\nSIMULAÇÃO — nada foi gravado. Rode de novo com --aplicar para gravar as ${correcoes.length} correções.`);
  process.exit(0);
}

console.log(`\nAplicando ${correcoes.length} correções...`);
let feitas = 0;
for (const c of correcoes) {
  await api(`/rest/v1/vendas?id=eq.${c.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ dataPagamento: `${c.para}T15:00:00+00:00` }),
  });
  feitas += 1;
  if (feitas % 100 === 0) console.log(`  ${feitas}/${correcoes.length}`);
}
console.log(`Concluído: ${feitas} vendas corrigidas.`);
