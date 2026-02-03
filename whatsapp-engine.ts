import * as wppconnect from '@wppconnect-team/wppconnect';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carrega as variáveis do arquivo .env
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Use a SERVICE_ROLE_KEY para scripts de backend para evitar problemas de RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log(`📡 Conectando ao Supabase: ${supabaseUrl}`);
console.log(`🔑 Modo de autenticação: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SERVICE_ROLE (Admin)' : 'ANON_KEY (Limitado)'}`);

const supabase = createClient(supabaseUrl, supabaseKey);

let isInitializing = false;
let clientInstance: wppconnect.Whatsapp | null = null;

async function startBot(lojaId: string) {
  if (isInitializing || clientInstance) {
    console.log('⚠️ O motor já está em execução ou inicializando.');
    return;
  }
  isInitializing = true;

  console.log(`🚀 Iniciando WPPConnect para loja: ${lojaId}`);

  try {
    clientInstance = await wppconnect.create({
      session: `loja-${lojaId}`,
      catchQR: async (base64Qr) => {
        console.log('📸 QR Code gerado');
        const { error } = await supabase.from('whatsapp_sessions').upsert({
          loja_id: lojaId, 
          qr_code: base64Qr, 
          status: 'qr_code',
          session_name: `loja-${lojaId}`
        }, { 
          onConflict: 'loja_id' 
        }).select();

        if (error) console.error('❌ Erro ao salvar QR Code no banco:', error.message);
      },
      statusFind: async (status) => {
        console.log(`ℹ️ Status atual: ${status}`);
        
        const successStatuses = ['isLogged', 'connected', 'inChat', 'qrReadSuccess', 'chatsAvailable'];
        const qrStatuses = ['notLogged', 'deviceNotConnected', 'waitingChat', 'desconnectedMobile', 'disconnectedMobile'];

        if (successStatuses.includes(status)) {
          await supabase.from('whatsapp_sessions').update({ 
            status: 'connected', 
            qr_code: null 
          }).eq('loja_id', lojaId);
        } else if (qrStatuses.includes(status)) {
          await supabase.from('whatsapp_sessions').update({ status: 'qr_code' }).eq('loja_id', lojaId);
        } else {
          await supabase.from('whatsapp_sessions').update({ status }).eq('loja_id', lojaId);
        }
      },
      folderNameToken: '.tokens',
      autoClose: 0,
      disableWelcome: true,
      updatesLog: false,
      puppeteerOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
      }
    });

    console.log('✅ WhatsApp conectado!');

    clientInstance.onAnyMessage(async (message) => {
      // Captura mensagens recebidas e também as enviadas por você (fromMe)
      if (message.isGroupMsg || message.type !== 'chat' || !message.body) return;

        // Tenta obter a mensagem completa para evitar truncamento em listas muito longas (WhatsApp Web "Read More")
        let messageBody = message.body;
        try {
          const fullMessage = await clientInstance!.getMessageById(message.id);
          if (fullMessage && fullMessage.body && fullMessage.body.length > messageBody.length) {
            messageBody = fullMessage.body;
            console.log(`📝 Mensagem longa detectada e recuperada na íntegra (${messageBody.length} caracteres).`);
          }
        } catch (e) {
          // Se falhar ao re-buscar, continua com o corpo original recebido
        }

        const senderName = message.fromMe ? 'Mim (Enviado)' : (message.sender.name || message.from);
        const lines = messageBody.split('\n');
        console.log(`📩 Processando lista de: ${senderName} (${lines.length} linhas)`);

        let currentModelName = '';
        let currentCapacity = '';
        let pendingColors: string[] = [];
        const extractedData: Record<string, number[]> = {};

        // 1. Percorre as linhas para agrupar preços por modelo
        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          // Identifica o modelo (Linhas que começam com 📲 ou 📱)
          const modelMatch = cleanLine.match(/^[📲📱]\s*\*?([^*🇺🇸%]+)\*?/iu);
          if (modelMatch) {
            let fullModel = modelMatch[1].replace(/\*/g, '').replace(/IPHONE/gi, 'iPhone').replace(/\p{Extended_Pictographic}/gu, '').trim();
            
            const capMatch = fullModel.match(/(\d+\s*(?:GB|TB))/i);
            if (capMatch) {
              currentCapacity = capMatch[1].toUpperCase().replace(/\s/g, "");
              currentModelName = fullModel.replace(capMatch[0], "").trim();
            } else {
              currentModelName = fullModel;
              currentCapacity = "N/A";
            }
            pendingColors = [];
            continue;
          }

          // Detectar cor em linha separada (ex: 🔵BLUE)
          const colorOnlyMatch = cleanLine.match(/^[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18\ud83d\udfe4\ud83d\udfe5\ud83d\udfe6\ud83d\udfe7\ud83d\udfe8\ud83d\udfe9\ud83d\udfea\ud83d\udfeb]\s*([A-Z\s/]+)$/i);
          if (colorOnlyMatch && !cleanLine.match(/\d/)) {
            pendingColors.push(colorOnlyMatch[1].trim());
            continue;
          }

          // Identifica preços na linha (ex: 1100,00 ou R$ 8.550,00)
          const priceMatch = cleanLine.match(/(?:💰|💵|R\$|[\u26aa\u26ab\ud83d\udd35\ud83d\udfe0\ud83c\udf38\ud83d\udfe2\ud83d\udfe1\ud83d\udfe3\ud83d\udc2a\ud83d\udc2d\ud83d\udd18])\s*(?:R\$)?\s*(?:\d+%\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d{3,})/i);
          
          if (priceMatch && currentModelName) {
            const rawPrice = priceMatch[1].replace(/\./g, '').replace(',', '.');
            const price = parseFloat(rawPrice);
            
            if (!isNaN(price) && price > 0) {
              const colorsToProcess = [...pendingColors];
              if (colorsToProcess.length === 0) {
                let detectedColor = "N/A";
                if (cleanLine.includes("⚫")) detectedColor = "Preto";
                else if (cleanLine.includes("⚪")) detectedColor = "Branco/Prata";
                else if (cleanLine.includes("🔵")) detectedColor = "Azul";
                else if (cleanLine.includes("🟡")) detectedColor = "Dourado/Amarelo";
                else if (cleanLine.includes("🔴")) detectedColor = "Vermelho";
                else if (cleanLine.includes("🟣")) detectedColor = "Roxo";
                else if (cleanLine.includes("🟢")) detectedColor = "Verde";
                else if (cleanLine.includes("🩷")) detectedColor = "Rosa";
                else if (cleanLine.includes("🩶")) detectedColor = "Cinza";
                else if (cleanLine.includes("🔘")) detectedColor = "Space Gray/Titanium";
                else if (cleanLine.includes("🐪")) detectedColor = "Desert/Natural";
                else if (cleanLine.includes("🏜️")) detectedColor = "Desert";
                colorsToProcess.push(detectedColor);
              }

              for (const cor of colorsToProcess) {
                const key = `${currentModelName}|${currentCapacity}|${cor}`;
                if (!extractedData[key]) extractedData[key] = [];
                extractedData[key].push(price);
              }
              pendingColors = [];
            }
          }
        }

        // 2. Processa os dados agrupados
        const entries = Object.entries(extractedData);
        console.log(`📦 Total de modelos únicos encontrados: ${entries.length}`);

        for (let i = 0; i < entries.length; i++) {
          const [model, prices] = entries[i];
          if (prices.length === 0) continue;
          
          // Ordena do maior para o menor
          const sortedPrices = [...prices].sort((a, b) => b - a);
          
          // Calcula a frequência de cada preço (Moda)
          const counts: Record<number, number> = {};
          prices.forEach(p => counts[p] = (counts[p] || 0) + 1);
          
          const maxFreq = Math.max(...Object.values(counts));
          const modes = Object.keys(counts)
            .filter(p => counts[Number(p)] === maxFreq)
            .map(Number)
            .sort((a, b) => b - a); // Pega o maior preço entre os mais frequentes

          const bestMode = modes[0];

          let finalPrice: number;
          
          if (maxFreq > 1) {
            // Se um preço se repete, ele é o padrão (ex: vários a 2200)
            finalPrice = bestMode;
          } else if (prices.length >= 3) {
            // Se todos são únicos, faz a média apenas da metade superior (ignora os muito baratos)
            const topHalf = sortedPrices.slice(0, Math.ceil(prices.length / 2));
            finalPrice = topHalf.reduce((a, b) => a + b, 0) / topHalf.length;
          } else {
            // Se tem 1 ou 2 preços únicos, pega o maior (preço base)
            finalPrice = sortedPrices[0];
          }

          const [modelName, capacity, cor] = model.split('|');
          const displayModel = `${modelName} ${capacity} (${cor})`;
          console.log(`📊 [${i + 1}/${entries.length}] Modelo: ${displayModel} | Preços: ${prices.length} | Final: R$ ${finalPrice.toFixed(2)}`);

          // 3. Salva no Banco de Dados
          try {
            const { error: logError } = await supabase.from('whatsapp_logs').insert({
              loja_id: lojaId,
              contato: senderName,
              mensagem: `Extraído da lista: ${displayModel}`,
              peca: displayModel,
              preco: finalPrice
            });
            if (logError) console.error(`❌ Erro ao inserir log para ${displayModel}:`, logError.message);

            // Atualiza a tabela de Peças
            const { data: pecasUpdated, error: pecasError } = await supabase.from('pecas')
              .update({ 
                vendaPeca: finalPrice * 100, // Assume que o banco armazena em centavos
                descricao: `EDITADO COM BASE NA LISTA DE "${senderName}"`
              })
              .ilike('nome', `%${modelName}%`)
              .eq('loja_id', lojaId)
              .select();

            if (pecasError) console.error(`❌ Erro ao atualizar pecas (${displayModel}):`, pecasError.message);
            else console.log(`   - Peças: ${pecasUpdated?.length || 0} registros encontrados e atualizados.`);

            // Atualiza a tabela de Aparelhos
            let query = supabase.from('aparelhos')
              .update({ 
                preco: finalPrice,
                observacoes: `EDITADO COM BASE NA LISTA DE "${senderName}"`
              })
              .ilike('modelo', modelName)
              .ilike('cor', cor)
              .eq('loja_id', lojaId)
              .eq('condicao', 'seminovo');

            if (capacity && capacity !== "N/A") {
              query = query.eq('capacidade', capacity);
            }

            const { data: aparelhosUpdated, error: aparelhosError } = await query.select();

            if (aparelhosError) console.error(`❌ Erro ao atualizar aparelhos (${displayModel}):`, aparelhosError.message);
            else if (aparelhosUpdated && aparelhosUpdated.length > 0) {
              console.log(`   - Aparelhos: ${aparelhosUpdated.length} registros encontrados e atualizados.`);
            } else {
              // Se não encontrou nenhum aparelho para atualizar, cria um novo registro automaticamente
              console.log(`   - Aparelhos: 0 registros encontrados. Criando novo registro para "${displayModel}"...`);
              
              const { error: insertError } = await supabase.from('aparelhos').insert({
                loja_id: lojaId,
                marca: modelName.toUpperCase().includes('IPHONE') ? 'Apple' : 'Smartphone',
                modelo: modelName,
                capacidade: capacity,
                cor: cor,
                condicao: 'seminovo',
                preco: finalPrice,
                ativo: true,
                observacoes: `Criado de Lista "${senderName}"`
              });

              if (insertError) console.error(`❌ Erro ao cadastrar novo aparelho (${displayModel}):`, insertError.message);
              else console.log(`   - ✅ Novo aparelho "${displayModel}" cadastrado com sucesso.`);
            }

          } catch (dbError) {
            console.error(`❌ Erro ao atualizar banco para ${model}:`, dbError);
          }
        }
        console.log(`✅ Processamento da lista de ${senderName} finalizado.`);
    });
  } catch (error) {
    console.error('❌ Erro crítico ao iniciar motor:', error);
    clientInstance = null;
    // Avisa o banco que falhou para permitir nova tentativa
    await supabase.from('whatsapp_sessions').update({ status: 'disconnected', qr_code: null }).eq('loja_id', lojaId);
  } finally {
    isInitializing = false;
  }
}

// Pega o ID da loja via argumento do terminal ou variável de ambiente
const LOJA_ID = process.argv[2];

if (!LOJA_ID) {
  console.error('❌ Erro: Você precisa passar o ID da loja.');
  console.log('Exemplo: pnpm exec tsx whatsapp-engine.ts SEU_ID_AQUI');
  process.exit(1);
}

async function init() {
  console.log(`🔍 Verificando registro de sessão para loja ${LOJA_ID}...`);
  
  // Garante que a linha existe no banco de dados
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('status')
    .eq('loja_id', LOJA_ID)
    .single();

  if (error && error.code === 'PGRST116') {
    console.log('🆕 Nenhuma sessão encontrada. Criando registro inicial...');
    await supabase.from('whatsapp_sessions').insert({ 
      loja_id: LOJA_ID, 
      status: 'disconnected',
      session_name: `loja-${LOJA_ID}`
    });
  } else if (data) {
    console.log(`✅ Registro encontrado. Status no banco: ${data.status}`);
  }

  // Tenta iniciar o bot automaticamente ao abrir o script para recuperar sessão existente
  startBot(LOJA_ID);

  console.log(`\n👀 Aguardando comando 'initializing' no banco...`);

  // Escuta o banco de dados em tempo real
  supabase
  .channel('whatsapp_commands')
  .on('postgres_changes', { 
    event: '*', 
    schema: 'public', 
    table: 'whatsapp_sessions'
  }, (payload) => {
    const status = payload.new ? (payload.new as any).status : null;
    const payloadLojaId = payload.new ? (payload.new as any).loja_id : null;

    console.log('🔔 Evento recebido do banco:', payload.eventType, 'Status:', status, 'Loja:', payloadLojaId);

    if (status === 'initializing' && payloadLojaId === LOJA_ID) {
      startBot(LOJA_ID);
    }
  })
  .subscribe((status) => {
    console.log('📡 Status da conexão Realtime:', status);
    if (status === 'CHANNEL_ERROR') {
      console.error('❌ Erro: Não foi possível conectar ao Realtime. Verifique se o Realtime está ativo no painel do Supabase.');
    }
  });
}

init();

// Tratamento para fechar o script corretamente e avisar o site
const handleExit = async () => {
  console.log('\n🛑 Encerrando motor e atualizando status no banco...');
  await supabase
    .from('whatsapp_sessions')
    .update({ status: 'disconnected', qr_code: null })
    .eq('loja_id', LOJA_ID);
  process.exit();
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
