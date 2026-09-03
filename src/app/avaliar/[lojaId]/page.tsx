'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { 
  calcularAvaliacaoUpgrade, 
  TABELA_BASE_UPGRADE_PADRAO, 
  MODELOS_UPGRADE_DISPONIVEIS,
  RespostaCondicaoUpgrade,
  ResultadoAvaliacaoUpgrade,
  gerarProtocoloUpgrade
} from '@/lib/upgradeEngine';
import { 
  Smartphone, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Battery, 
  Shield, 
  Sparkles, 
  MessageCircle, 
  Search, 
  RefreshCw, 
  Check, 
  Clock, 
  MapPin, 
  Phone,
  Building2,
  AlertCircle
} from 'lucide-react';
import { cn, sortModelosCronologico } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function AvaliacaoPublicaUpgradePage() {
  const params = useParams();
  const lojaId = params?.lojaId as string;

  // Dados da loja
  const [loja, setLoja] = useState<any>(null);
  const [loadingLoja, setLoadingLoja] = useState(true);

  // Etapas do Wizard: 1: Modelo -> 2: Capacidade -> 3: Condição -> 4: Resultado -> 5: Concluído
  const [etapa, setEtapa] = useState<number>(1);

  // Estados da Simulação
  const [buscaModelo, setBuscaModelo] = useState('');
  const [modeloSelecionado, setModeloSelecionado] = useState<string>('');
  const [capacidadeSelecionada, setCapacidadeSelecionada] = useState<string>('');
  const [cor, setCor] = useState<string>('');

  // Checklist de Condição
  const [condicoes, setCondicoes] = useState<RespostaCondicaoUpgrade>({
    bateriaPercentual: 88,
    estadoTela: 'original_impecavel',
    estadoCarcaca: 'impecavel',
    faceIdFunciona: true,
    camerasFuncionam: true,
    temCaixaAcessorios: true,
    conectorCarregadorOk: true,
  });

  // Dados de Contato do Cliente
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [aparelhoDesejado, setAparelhoDesejado] = useState('');
  const [salvandoProposta, setSalvandoProposta] = useState(false);
  const [protocoloGerado, setProtocoloGerado] = useState<string>('');

  // Carrega informações da Loja (Nome, Logo, Telefone, Regras customizadas)
  useEffect(() => {
    if (!lojaId) {
      setLoadingLoja(false);
      return;
    }

    const carregarLoja = async () => {
      try {
        setLoadingLoja(true);
        const { data, error } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', lojaId)
          .maybeSingle();

        if (data && !error) {
          setLoja(data);
        }
      } catch (e) {
        console.error('Erro ao buscar loja:', e);
      } finally {
        setLoadingLoja(false);
      }
    };

    carregarLoja();
  }, [lojaId]);

  // Modelos disponíveis dinamicamente da loja (padrão + novos cadastrados pelo lojista)
  const modelosDisponiveis = useMemo(() => {
    const tabela = loja?.tabela_upgrade && typeof loja.tabela_upgrade === 'object' && Object.keys(loja.tabela_upgrade).length > 0
      ? loja.tabela_upgrade
      : TABELA_BASE_UPGRADE_PADRAO;
    const keys = Object.keys(tabela);
    return keys.sort((a, b) => sortModelosCronologico(a, b, 'antigo_para_novo'));
  }, [loja]);

  // Lista de modelos filtrados
  const modelosFiltrados = useMemo(() => {
    if (!buscaModelo.trim()) return modelosDisponiveis;
    const b = buscaModelo.toLowerCase().trim();
    return modelosDisponiveis.filter((m) => m.toLowerCase().includes(b));
  }, [buscaModelo, modelosDisponiveis]);

  // Capacidades disponíveis para o modelo selecionado
  const capacidadesDisponiveis = useMemo(() => {
    if (!modeloSelecionado) return ['64GB', '128GB', '256GB'];
    const tabela = loja?.tabela_upgrade && typeof loja.tabela_upgrade === 'object' && Object.keys(loja.tabela_upgrade).length > 0
      ? loja.tabela_upgrade
      : TABELA_BASE_UPGRADE_PADRAO;

    const modeloData = tabela[modeloSelecionado];
    if (modeloData) {
      return Object.keys(modeloData);
    }
    return ['64GB', '128GB', '256GB'];
  }, [modeloSelecionado, loja]);

  // Resultado da Avaliação calculado em tempo real
  const resultadoAvaliacao: ResultadoAvaliacaoUpgrade = useMemo(() => {
    if (!modeloSelecionado || !capacidadeSelecionada) {
      return {
        modelo: modeloSelecionado || 'iPhone',
        capacidade: capacidadeSelecionada || '128GB',
        valorBase: 0,
        deducoes: [],
        totalDeducoes: 0,
        valorFinal: 0,
        valorRevendaEstimado: 0,
        lucroEstimadoLoja: 0,
      };
    }

    return calcularAvaliacaoUpgrade(
      modeloSelecionado,
      capacidadeSelecionada,
      condicoes,
      loja?.tabela_upgrade,
      loja?.regras_upgrade
    );
  }, [modeloSelecionado, capacidadeSelecionada, condicoes, loja]);

  // Enviar Avaliação e Salvar no Sistema do Lojista
  const handleEnviarAvaliacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim()) {
      alert('Por favor, informe seu nome.');
      return;
    }

    setSalvandoProposta(true);
    const proto = gerarProtocoloUpgrade();
    setProtocoloGerado(proto);

    const payload: any = {
      loja_id: lojaId || null,
      protocolo: proto,
      cliente_nome: clienteNome.trim(),
      cliente_telefone: clienteTelefone.trim(),
      cliente_cidade: clienteCidade.trim(),
      modelo: modeloSelecionado,
      capacidade: capacidadeSelecionada,
      cor: cor.trim() || 'Não especificada',
      bateria_saude: condicoes.bateriaPercentual,
      condicao_geral: condicoes.estadoTela === 'original_impecavel' && condicoes.estadoCarcaca === 'impecavel' ? 'Excelente' : 'Bom',
      detalhes_condicao: condicoes,
      valor_base: resultadoAvaliacao.valorBase,
      descontos_aplicados: resultadoAvaliacao.deducoes,
      valor_avaliado: resultadoAvaliacao.valorFinal,
      valor_aprovado: resultadoAvaliacao.valorFinal,
      status: 'pendente',
      aparelho_interesse: aparelhoDesejado.trim() || 'Qualquer Modelo',
      origem: 'web_publico',
      observacoes: `Avaliação pública enviada pelo cliente. Aparelho desejado: ${aparelhoDesejado || 'Não informado'}`,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from('avaliacoes_upgrade').insert([payload]);
    } catch (err) {
      console.warn('Erro ao gravar no Supabase, mantendo fluxo ativo:', err);
    } finally {
      setSalvandoProposta(false);
      setEtapa(5); // Tela de Conclusão / WhatsApp
    }
  };

  // Abrir WhatsApp da Loja com Mensagem Pronta
  const handleAbrirWhatsApp = () => {
    const telLoja = (loja?.telefone_cobranca || loja?.telefone || '553199999999').replace(/\D/g, '');
    const msg = `Olá *${loja?.nome || 'Phone Center'}*! 👋\n\nAcabei de fazer a simulação do meu aparelho pelo site de vocês:\n\n📱 *Aparelho:* ${modeloSelecionado} ${capacidadeSelecionada}\n🔋 *Bateria:* ${condicoes.bateriaPercentual}%\n💰 *Valor Estimado:* R$ ${resultadoAvaliacao.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n🔖 *Protocolo:* ${protocoloGerado || '#UPG-NOVO'}\n\n👤 *Meu Nome:* ${clienteNome || 'Cliente'}\n🎯 *Quero trocar pelo:* ${aparelhoDesejado || 'Aparelho Novo'}\n\nGostaria de agendar a avaliação e ver as opções disponíveis para o meu Upgrade!`;
    
    const url = `https://wa.me/${telLoja}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center selection:bg-emerald-500 selection:text-black">
      
      {/* CABEÇALHO DA LOJA */}
      <header className="w-full max-w-2xl px-4 pt-6 pb-4 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          {loja?.logo ? (
            <img src={loja.logo} alt={loja.nome} className="w-10 h-10 object-contain rounded-xl bg-slate-900 border border-slate-800 p-1" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-extrabold shadow-lg shadow-cyan-950/40">
              <Smartphone className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-base font-extrabold text-white leading-tight">
              {loja?.nome || 'Calculadora de Upgrade'}
            </h1>
            <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Avaliação Instantânea de Aparelhos
            </p>
          </div>
        </div>

        <div className="text-right hidden sm:block">
          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Programa Oficial</span>
          <span className="text-xs font-bold text-slate-200">Trade-In & Troca Fácil</span>
        </div>
      </header>

      {/* CORPO PRINCIPAL DO WIZARD */}
      <main className="w-full max-w-2xl px-4 py-6 flex-1 flex flex-col justify-start">
        
        {/* BARRA DE PROGRESSO */}
        {etapa < 5 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Etapa {etapa} de 4: {
                etapa === 1 ? 'Escolha o Modelo' :
                etapa === 2 ? 'Capacidade de Memória' :
                etapa === 3 ? 'Estado do Aparelho' : 'Resultado da Avaliação'
              }</span>
              <span className="text-emerald-400">{Math.round((etapa / 4) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="bg-gradient-to-r from-cyan-500 via-emerald-400 to-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(etapa / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* ── ETAPA 1: ESCOLHA DO MODELO ── */}
        {etapa === 1 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white">Qual iPhone você quer avaliar?</h2>
              <p className="text-xs text-slate-400 mt-0.5">Selecione o seu modelo para descobrir o valor de recompra da loja.</p>
            </div>

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Pesquise seu modelo (ex: iPhone 13, 14 Pro, 11)..."
                value={buscaModelo}
                onChange={(e) => setBuscaModelo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-colors"
                autoFocus
              />
              {buscaModelo && (
                <button
                  onClick={() => setBuscaModelo('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm"
                >
                  ×
                </button>
              )}
            </div>

            {/* Grade de Modelos Ordenados Cronologicamente */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[460px] overflow-y-auto pr-1">
              {modelosFiltrados.map((modelo) => {
                const isSelected = modeloSelecionado === modelo;
                return (
                  <button
                    key={modelo}
                    type="button"
                    onClick={() => {
                      setModeloSelecionado(modelo);
                      setCapacidadeSelecionada('');
                      setEtapa(2);
                    }}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none",
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/40"
                        : "bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-200 hover:bg-slate-800/80"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <Smartphone className="w-4 h-4 text-cyan-400" />
                      {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                    </div>
                    <span className="font-bold text-sm text-white mt-3 block">{modelo}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Clique para avançar ➔</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ETAPA 2: ESCOLHA DA CAPACIDADE ── */}
        {etapa === 2 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEtapa(1)}
                className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white">Qual a capacidade do {modeloSelecionado}?</h2>
                <p className="text-xs text-slate-400">Você encontra essa informação em Ajustes ➔ Geral ➔ Sobre.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {capacidadesDisponiveis.map((cap) => {
                const isSelected = capacidadeSelecionada === cap;
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => {
                      setCapacidadeSelecionada(cap);
                      setEtapa(3);
                    }}
                    className={cn(
                      "p-5 rounded-2xl border text-center transition-all cursor-pointer select-none flex flex-col items-center justify-center gap-2",
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-950/40"
                        : "bg-slate-900/90 border-slate-800 hover:border-slate-700 text-slate-200 hover:bg-slate-800/80"
                    )}
                  >
                    <span className="text-xl font-black text-white">{cap}</span>
                    <span className="text-[11px] text-cyan-400 font-bold">Continuar ➔</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ETAPA 3: DIAGNÓSTICO E ESTADO DE CONSERVAÇÃO ── */}
        {etapa === 3 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEtapa(2)}
                className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-white">Qual o estado do seu {modeloSelecionado}?</h2>
                <p className="text-xs text-slate-400">Responda com sinceridade para obter uma pré-avaliação garantida.</p>
              </div>
            </div>

            {/* 1. Saúde da Bateria */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <Battery className="w-4 h-4 text-emerald-400" /> Saúde da Bateria
                </label>
                <span className={cn(
                  "px-2.5 py-0.5 rounded-lg text-xs font-extrabold",
                  condicoes.bateriaPercentual >= 85 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                  condicoes.bateriaPercentual >= 80 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                  "bg-red-500/20 text-red-400 border border-red-500/30"
                )}>
                  {condicoes.bateriaPercentual}% ({condicoes.bateriaPercentual >= 80 ? 'Normal' : 'Manutenção'})
                </span>
              </div>

              <input
                type="range"
                min="65"
                max="100"
                value={condicoes.bateriaPercentual}
                onChange={(e) => setCondicoes({ ...condicoes, bateriaPercentual: parseInt(e.target.value) })}
                className="w-full accent-emerald-500 cursor-pointer"
              />

              <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                <span>65% (Trocada / Baixa)</span>
                <span>80% (Intermediária)</span>
                <span>100% (Impecável)</span>
              </div>
            </div>

            {/* 2. Estado da Tela */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
              <label className="text-xs font-bold text-white block">Estado da Tela / Display</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'original_impecavel', label: 'Original e sem riscos', desc: 'Tela nunca trocada e perfeita' },
                  { id: 'riscos_leves', label: 'Riscos leves de uso', desc: 'Marcas superficiais, sem trincas' },
                  { id: 'trocada_compativel', label: 'Já foi trocada', desc: 'Tela substituída por assistência' },
                  { id: 'trincada_quebrada', label: 'Trincada ou com manchas', desc: 'Vidro quebrado ou listras' },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setCondicoes({ ...condicoes, estadoTela: op.id as any })}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      condicoes.estadoTela === op.id
                        ? "bg-cyan-950/40 border-cyan-500 text-white"
                        : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                    )}
                  >
                    <span className="font-bold text-xs block text-white">{op.label}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{op.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Estado da Carcaça e Traseira */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
              <label className="text-xs font-bold text-white block">Estado da Carcaça e Traseira</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'impecavel', label: 'Impecável / Sem marcas', desc: 'Sempre usado com capa e película' },
                  { id: 'marcas_leves', label: 'Marcas leves de uso', desc: 'Pequenos pontinhos normais' },
                  { id: 'amassados_arranhaos', label: 'Amassados ou descascados', desc: 'Marcas de queda visíveis' },
                  { id: 'trincada_quebrada', label: 'Vidro traseiro trincado', desc: 'Traseira quebrada' },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setCondicoes({ ...condicoes, estadoCarcaca: op.id as any })}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer",
                      condicoes.estadoCarcaca === op.id
                        ? "bg-cyan-950/40 border-cyan-500 text-white"
                        : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                    )}
                  >
                    <span className="font-bold text-xs block text-white">{op.label}</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{op.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Funcionalidades Essenciais */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <label className="text-xs font-bold text-white block">Funcionalidades</label>
              <div className="space-y-2">
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-bold text-white block">Face ID / Touch ID funciona perfeitamente?</span>
                    <span className="text-[10px] text-slate-400">Reconhecimento facial ou leitor biométrico</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={condicoes.faceIdFunciona}
                    onChange={(e) => setCondicoes({ ...condicoes, faceIdFunciona: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-bold text-white block">Câmeras traseira e frontal funcionando 100%?</span>
                    <span className="text-[10px] text-slate-400">Fotos nítidas, sem manchas ou tremores</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={condicoes.camerasFuncionam}
                    onChange={(e) => setCondicoes({ ...condicoes, camerasFuncionam: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                  <div className="text-xs">
                    <span className="font-bold text-white block">Possui a caixa original do aparelho?</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">+ Bônus de avaliação extra</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={condicoes.temCaixaAcessorios}
                    onChange={(e) => setCondicoes({ ...condicoes, temCaixaAcessorios: e.target.checked })}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            <Button
              onClick={() => setEtapa(4)}
              className="w-full bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm py-3.5 rounded-2xl shadow-xl shadow-emerald-950/40 cursor-pointer"
            >
              Calcular Avaliação Agora ➔
            </Button>
          </div>
        )}

        {/* ── ETAPA 4: RESULTADO DA AVALIAÇÃO + CAPTURA DE PROPOSTA ── */}
        {etapa === 4 && (
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* CARD DE VALOR EM DESTAQUE */}
            <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/60 border border-cyan-500/40 rounded-3xl text-center relative overflow-hidden shadow-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold mb-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Avaliação Concluída com Sucesso
              </div>
              
              <h3 className="text-sm font-semibold text-slate-300">
                Seu {modeloSelecionado} {capacidadeSelecionada} vale até:
              </h3>

              <div className="my-3">
                <span className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-emerald-400">
                  R$ {resultadoAvaliacao.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Esse valor pode ser recebido em <strong>PIX na hora</strong> ou utilizado como <strong>abatimento imediato</strong> na troca por um modelo mais novo na loja.
              </p>

              {/* Selos de Confiança */}
              <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center justify-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" /> Proposta válida por 7 dias
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> Avaliação sem compromisso
                </div>
              </div>
            </div>

            {/* DETALHAMENTO DO CÁLCULO */}
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl space-y-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Detalhamento da Avaliação</span>
                <span className="text-slate-400 lowercase font-normal">base: R$ {resultadoAvaliacao.valorBase}</span>
              </h4>

              {resultadoAvaliacao.deducoes.length === 0 ? (
                <p className="text-xs text-emerald-400 font-medium">Aparelho em estado impecável! Cotação no teto máximo.</p>
              ) : (
                <div className="space-y-1 text-xs">
                  {resultadoAvaliacao.deducoes.map((d, i) => (
                    <div key={i} className="flex justify-between items-center text-slate-300 py-1 border-b border-slate-800/60 last:border-0">
                      <span>{d.motivo}</span>
                      <span className={d.valor > 0 ? "text-amber-400 font-bold" : "text-emerald-400 font-bold"}>
                        {d.valor > 0 ? `- R$ ${d.valor}` : `+ R$ ${Math.abs(d.valor)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* FORMULÁRIO DE CAPTURA DO CLIENTE (LEAD) */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <div>
                <h4 className="text-base font-extrabold text-white">Quer garantir essa oferta ou simular o Upgrade?</h4>
                <p className="text-xs text-slate-400 mt-0.5">Preencha seus dados para receber o comprovante e falar com nossa equipe.</p>
              </div>

              <form onSubmit={handleEnviarAvaliacao} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Seu Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João Silva"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">WhatsApp (DDD + Número) *</label>
                    <input
                      type="tel"
                      required
                      placeholder="Ex: (31) 99999-9999"
                      value={clienteTelefone}
                      onChange={(e) => setClienteTelefone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Sua Cidade</label>
                    <input
                      type="text"
                      placeholder="Ex: Belo Horizonte"
                      value={clienteCidade}
                      onChange={(e) => setClienteCidade(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Qual aparelho você gostaria de pegar na troca? (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: iPhone 15 Pro Max 256GB, ou Apenas Venda em Dinheiro"
                    value={aparelhoDesejado}
                    onChange={(e) => setAparelhoDesejado(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEtapa(3)}
                    className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Voltar
                  </button>
                  <Button
                    type="submit"
                    disabled={salvandoProposta}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-sm py-3 rounded-xl shadow-lg shadow-emerald-950/30 cursor-pointer"
                  >
                    {salvandoProposta ? 'Enviando proposta...' : 'Garantir Avaliação & Conversar no WhatsApp ➔'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── ETAPA 5: CONFIRMAÇÃO COM PROTOCOLO E WHATSAPP ── */}
        {etapa === 5 && (
          <div className="space-y-6 animate-in zoom-in-95 duration-300 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-3xl mx-auto flex items-center justify-center shadow-xl">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Avaliação Registrada</span>
              <h2 className="text-2xl font-black text-white">Parabéns, {clienteNome.split(' ')[0]}!</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Sua avaliação foi salva no sistema da loja. Clique no botão abaixo para conversar no WhatsApp com nossa equipe e concluir a troca.
              </p>
            </div>

            {/* Cartão de Resumo */}
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-left space-y-2 max-w-md mx-auto">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-800">
                <span className="text-slate-400">Protocolo da Avaliação:</span>
                <span className="font-mono font-bold text-cyan-400">{protocoloGerado}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Aparelho Avaliado:</span>
                <span className="font-bold text-white">{modeloSelecionado} {capacidadeSelecionada}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Valor Estimado:</span>
                <span className="font-extrabold text-emerald-400">R$ {resultadoAvaliacao.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              {aparelhoDesejado && (
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-slate-400">Interesse em:</span>
                  <span className="font-bold text-slate-200">{aparelhoDesejado}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAbrirWhatsApp}
              className="w-full max-w-md mx-auto bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-slate-950 font-black text-sm py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <MessageCircle className="w-5 h-5" /> Abrir no WhatsApp da Loja
            </button>

            <button
              onClick={() => {
                setEtapa(1);
                setModeloSelecionado('');
                setCapacidadeSelecionada('');
              }}
              className="text-xs text-slate-400 hover:text-white underline block mx-auto cursor-pointer"
            >
              Fazer outra avaliação de aparelho
            </button>
          </div>
        )}

      </main>

      {/* RODAPÉ */}
      <footer className="w-full py-4 text-center text-[11px] text-slate-500 border-t border-slate-800/80">
        <p>© {new Date().getFullYear()} {loja?.nome || 'Phone Center'} • Programa de Upgrade e Avaliação de Usados</p>
      </footer>

    </div>
  );
}
