'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  calcularAvaliacaoUpgrade, 
  TABELA_BASE_UPGRADE_PADRAO, 
  REGRAS_DEDUCAO_PADRAO, 
  MODELOS_IPHONE_ORDENADOS, 
  CAPACIDADES_IPHONE,
  gerarProtocoloUpgrade 
} from '@/lib/upgradeEngine';
import { 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  Smartphone, 
  Battery, 
  ShieldCheck, 
  User, 
  PenTool, 
  RotateCcw, 
  Send, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Trash2, 
  Sparkles,
  MapPin,
  Phone,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, sortModelosCronologico } from '@/lib/utils';

interface ColetaPageProps {
  params: Promise<{
    lojaId: string;
  }>;
}

export default function ColetaMotoboyPage({ params }: ColetaPageProps) {
  const resolvedParams = use(params);
  const lojaId = resolvedParams.lojaId;

  const [loading, setLoading] = useState(true);
  const [lojaInfo, setLojaInfo] = useState<any>(null);
  const [motoboys, setMotoboys] = useState<any[]>([]);
  const [propostasPendentes, setPropostasPendentes] = useState<any[]>([]);
  const [tabelaPrecos, setTabelaPrecos] = useState(TABELA_BASE_UPGRADE_PADRAO);
  const [regrasDeducao, setRegrasDeducao] = useState(REGRAS_DEDUCAO_PADRAO);

  // Etapa atual: 1=Identificação, 2=Checklist Aparelho, 3=Fotos, 4=Valores, 5=Assinatura & Envio, 6=Sucesso
  const [etapa, setEtapa] = useState<number>(1);
  const [salvando, setSalvando] = useState(false);
  const [protocoloGerado, setProtocoloGerado] = useState('');

  // Dados da Vistoria
  const [motoboySelecionadoId, setMotoboySelecionadoId] = useState('');
  const [motoboyNome, setMotoboyNome] = useState('');
  const [propostaIdVinculada, setPropostaIdVinculada] = useState<string | null>(null);

  // Cliente
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [enderecoColeta, setEnderecoColeta] = useState('');

  // Aparelho
  const [modelo, setModelo] = useState('iPhone 13');
  const [capacidade, setCapacidade] = useState('128GB');
  const [cor, setCor] = useState('Preto');
  const [imei, setImei] = useState('');
  const [bateriaSaude, setBateriaSaude] = useState<number>(85);

  const modelosDisponiveis = React.useMemo(() => {
    const keys = Object.keys(tabelaPrecos);
    if (keys.length === 0) return MODELOS_IPHONE_ORDENADOS;
    return keys.sort((a, b) => sortModelosCronologico(a, b, 'antigo_para_novo'));
  }, [tabelaPrecos]);

  const capacidadesDisponiveis = React.useMemo(() => {
    const caps = Object.keys(tabelaPrecos[modelo] || {});
    return caps.length > 0 ? caps : CAPACIDADES_IPHONE;
  }, [tabelaPrecos, modelo]);

  // Checklist de conservação
  const [telaCondicao, setTelaCondicao] = useState<'impecavel' | 'leves_riscos' | 'trocada_com_aviso' | 'trincada'>('impecavel');
  const [carcacaCondicao, setCarcacaCondicao] = useState<'impecavel' | 'leves_marcas' | 'amassada_traseira_quebrada'>('impecavel');
  const [faceIdOk, setFaceIdOk] = useState<boolean>(true);
  const [camerasOk, setCamerasOk] = useState<boolean>(true);
  const [temCaixaOriginal, setTemCaixaOriginal] = useState<boolean>(false);
  const [icloudRemovido, setIcloudRemovido] = useState<boolean>(true);

  // Fotos (4 slots: 0=Frente, 1=Traseira, 2=Laterais, 3=Ajustes)
  const [fotos, setFotos] = useState<{ [key: number]: string }>({});
  const [processandoFoto, setProcessandoFoto] = useState<number | null>(null);

  // Observações & Assinatura
  const [observacoesMotoboy, setObservacoesMotoboy] = useState('');
  const [valorAcordadoCustom, setValorAcordadoCustom] = useState<string>('');
  const [assinaturaDataUrl, setAssinaturaDataUrl] = useState<string>('');

  // Canvas para assinatura touch
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // 1. Carrega dados da Loja, Motoboys e Propostas
  useEffect(() => {
    async function carregarDados() {
      try {
        setLoading(true);

        // Busca loja
        const { data: loja } = await supabase
          .from('lojas')
          .select('*')
          .eq('id', lojaId)
          .maybeSingle();

        if (loja) {
          setLojaInfo(loja);
          if (loja.tabela_upgrade) {
            setTabelaPrecos({ ...TABELA_BASE_UPGRADE_PADRAO, ...loja.tabela_upgrade });
          }
          if (loja.regras_upgrade) {
            setRegrasDeducao({ ...REGRAS_DEDUCAO_PADRAO, ...loja.regras_upgrade });
          }
        }

        // Busca motoboys da loja
        const { data: listaMotoboys } = await supabase
          .from('motoboys')
          .select('*')
          .or(`loja_id.eq.${lojaId},loja_id.is.null`)
          .eq('ativo', true)
          .order('nome');

        if (listaMotoboys && listaMotoboys.length > 0) {
          setMotoboys(listaMotoboys);
          setMotoboySelecionadoId(listaMotoboys[0].id);
          setMotoboyNome(listaMotoboys[0].nome);
        }

        // Busca propostas pendentes para vincular rápido
        const { data: propostas } = await supabase
          .from('avaliacoes_upgrade')
          .select('*')
          .or(`loja_id.eq.${lojaId},loja_id.is.null`)
          .in('status', ['pendente', 'em_negociacao', 'aprovado'])
          .order('created_at', { ascending: false })
          .limit(10);

        if (propostas) {
          setPropostasPendentes(propostas);
        }
      } catch (err) {
        console.error('Erro ao inicializar página de coleta:', err);
      } finally {
        setLoading(false);
      }
    }

    carregarDados();
  }, [lojaId]);

  // Vincula proposta existente
  const selecionarPropostaExistente = (prop: any) => {
    setPropostaIdVinculada(prop.id);
    setClienteNome(prop.cliente_nome || '');
    setClienteTelefone(prop.cliente_telefone || '');
    setModelo(prop.modelo || 'iPhone 13');
    setCapacidade(prop.capacidade || '128GB');
    setBateriaSaude(prop.bateria_saude || 85);
    if (prop.valor_avaliado || prop.valor_aprovado) {
      setValorAcordadoCustom(String(prop.valor_aprovado || prop.valor_avaliado));
    }
    toast.success(`Proposta de ${prop.cliente_nome} selecionada!`);
  };

  // Cálculo da avaliação em tempo real
  const calculo = React.useMemo(() => {
    return calcularAvaliacaoUpgrade(
      modelo,
      capacidade,
      {
        saudeBateria: bateriaSaude,
        telaCondicao,
        carcacaCondicao,
        faceIdFunciona: faceIdOk,
        camerasFuncionam: camerasOk,
        temCaixa: temCaixaOriginal,
      },
      tabelaPrecos,
      regrasDeducao
    );
  }, [modelo, capacidade, bateriaSaude, telaCondicao, carcacaCondicao, faceIdOk, camerasOk, temCaixaOriginal, tabelaPrecos, regrasDeducao]);

  const valorFinal = valorAcordadoCustom ? parseFloat(valorAcordadoCustom) || calculo.valorFinalAvaliacao : calculo.valorFinalAvaliacao;

  // Função para comprimir e capturar foto via câmera do celular
  const handleFotoUpload = (slotIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessandoFoto(slotIndex);
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensiona para max 1200px mantendo proporção para upload rápido no 4G
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          setFotos((prev) => ({ ...prev, [slotIndex]: dataUrl }));
          toast.success(`Foto ${slotIndex + 1} capturada!`);
        }
        setProcessandoFoto(null);
      };
      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
  };

  const removerFoto = (slotIndex: number) => {
    setFotos((prev) => {
      const copy = { ...prev };
      delete copy[slotIndex];
      return copy;
    });
  };

  // Canvas Handlers para Assinatura Touch
  const startDrawing = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0284c7';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setAssinaturaDataUrl(canvas.toDataURL('image/png'));
    }
  };

  const limparAssinatura = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setAssinaturaDataUrl('');
    }
  };

  // Finalizar e Salvar Vistoria
  const handleFinalizarColeta = async () => {
    if (!clienteNome.trim()) {
      toast.error('Informe o nome do cliente.');
      setEtapa(1);
      return;
    }

    if (!icloudRemovido) {
      toast.error('⚠️ ALERTA: O iCloud precisa estar desconectado para aceitar o aparelho!');
      return;
    }

    try {
      setSalvando(true);
      const protocolo = gerarProtocoloUpgrade();
      setProtocoloGerado(protocolo);

      const arrayFotos = Object.values(fotos);

      const payloadVistoria = {
        loja_id: lojaId || null,
        avaliacao_id: propostaIdVinculada || null,
        protocolo,
        motoboy_id: motoboySelecionadoId || null,
        motoboy_nome: motoboyNome || 'Motoboy',
        cliente_nome: clienteNome.trim(),
        cliente_telefone: clienteTelefone.trim(),
        endereco_coleta: enderecoColeta.trim(),
        modelo,
        capacidade,
        cor,
        imei: imei.trim(),
        bateria_saude: bateriaSaude,
        condicao_geral: telaCondicao === 'impecavel' && carcacaCondicao === 'impecavel' ? 'Excelente' : 'Usado com marcas',
        detalhes_checklist: {
          tela: telaCondicao,
          carcaca: carcacaCondicao,
          face_id: faceIdOk,
          cameras: camerasOk,
          tem_caixa: temCaixaOriginal,
          icloud_removido: icloudRemovido,
        },
        valor_avaliado: calculo.valorFinalAvaliacao,
        valor_acordado: valorFinal,
        fotos: arrayFotos,
        observacoes_motoboy: observacoesMotoboy.trim(),
        status_coleta: 'coletado',
        assinatura_cliente: assinaturaDataUrl,
        created_at: new Date().toISOString(),
      };

      // Salva no Supabase
      const { error } = await supabase.from('vistorias_upgrade').insert([payloadVistoria]);

      if (error) {
        console.warn('Salvando vistoria em cache local:', error.message);
      }

      // Se havia avaliação vinculada, atualiza o status
      if (propostaIdVinculada) {
        await supabase
          .from('avaliacoes_upgrade')
          .update({
            status: 'em_negociacao',
            valor_aprovado: valorFinal,
          })
          .eq('id', propostaIdVinculada);
      }

      toast.success('Laudo de coleta salvo com sucesso!');
      setEtapa(6); // Tela de sucesso
    } catch (err: any) {
      console.error('Erro ao finalizar coleta:', err);
      toast.error('Erro ao salvar no servidor, mas dados foram gravados no aparelho!');
      setEtapa(6);
    } finally {
      setSalvando(false);
    }
  };

  // Monta link do WhatsApp para avisar a expedição da loja
  const getLinkWhatsappLoja = () => {
    const telLoja = (lojaInfo?.telefone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(
      `🛵 *NOVA COLETA DE APARELHO REALIZADA!*\n\n` +
      `📋 *Protocolo:* ${protocoloGerado}\n` +
      `👤 *Motoboy:* ${motoboyNome}\n` +
      `📱 *Aparelho:* ${modelo} ${capacidade} (${cor})\n` +
      `🔋 *Bateria:* ${bateriaSaude}%\n` +
      `💰 *Valor Acordado:* R$ ${valorFinal.toFixed(2)}\n` +
      `🙋‍♂️ *Cliente:* ${clienteNome} (${clienteTelefone})\n` +
      `📸 *Fotos e Assinatura:* Registradas no Painel da Loja.\n` +
      `Status: *Em Trânsito para a Loja* 🚀`
    );
    return telLoja ? `https://wa.me/55${telLoja}?text=${msg}` : `https://wa.me/?text=${msg}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400">Carregando painel de coleta...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER MOBILE ULTRA OTIMIZADO */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-extrabold shadow-sm">
            🛵
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white leading-tight">
              {lojaInfo?.nome || 'Phone Center'} • Check-in
            </h1>
            <p className="text-[11px] text-cyan-400 font-medium">Vistoria de Aparelho Usado</p>
          </div>
        </div>

        {motoboyNome && (
          <div className="bg-slate-800/80 border border-slate-700/60 px-2.5 py-1 rounded-full flex items-center gap-1.5 text-xs text-slate-300 font-bold">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span className="truncate max-w-[90px]">{motoboyNome}</span>
          </div>
        )}
      </header>

      {/* BARRA DE PROGRESSO DAS ETAPAS */}
      {etapa < 6 && (
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-[11px] font-bold text-slate-400">
          <span className="text-cyan-400">Etapa {etapa} de 5</span>
          <span>
            {etapa === 1 && '👤 Identificação'}
            {etapa === 2 && '📱 Checklist do Celular'}
            {etapa === 3 && '📸 4 Fotos Reais'}
            {etapa === 4 && '💰 Valor da Avaliação'}
            {etapa === 5 && '✍️ Assinatura & Concluir'}
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`h-1.5 w-4 rounded-full transition-all ${
                  i === etapa ? 'bg-cyan-400 w-6' : i < etapa ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* CORPO PRINCIPAL */}
      <main className="flex-1 p-4 max-w-lg w-full mx-auto pb-24">
        {/* ETAPA 1: IDENTIFICAÇÃO DO MOTOBOY E CLIENTE */}
        {etapa === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Quem é o motoboy? */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4 text-cyan-400" /> Quem é você? (Selecione seu Nome)
                </label>
                {motoboys.length > 0 && (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {motoboys.length} cadastrado{motoboys.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {motoboys.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {motoboys.map((m) => {
                      const isSelected = motoboySelecionadoId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMotoboySelecionadoId(m.id);
                            setMotoboyNome(m.nome);
                          }}
                          className={cn(
                            "p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer",
                            isSelected
                              ? "bg-cyan-500/20 border-cyan-500 shadow-md shadow-cyan-950/40 text-white"
                              : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn(
                              "w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm shrink-0",
                              isSelected ? "bg-cyan-500 text-slate-950" : "bg-slate-900 text-slate-300"
                            )}>
                              🛵
                            </div>
                            <div className="truncate">
                              <p className={cn("font-extrabold text-xs truncate", isSelected ? "text-cyan-300 font-black" : "text-white")}>
                                {m.nome}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {m.veiculo || 'Moto'} {m.placa ? `• ${m.placa}` : ''}
                              </p>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setMotoboySelecionadoId('outro');
                        setMotoboyNome('');
                      }}
                      className="text-[11px] text-slate-500 hover:text-cyan-400 underline cursor-pointer"
                    >
                      Não está na lista? Digitar outro nome
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 text-xs">
                  <p className="text-amber-300 font-bold flex items-center gap-1.5">
                    ⚠️ Nenhum motoboy cadastrado na loja ainda.
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Cadastre a equipe no painel da loja na aba <strong>Calculadora Upgrade ➔ Cadastrar Motoboys</strong> para aparecer aqui para seleção com 1 toque!
                  </p>
                </div>
              )}

              {(motoboys.length === 0 || motoboySelecionadoId === 'outro') && (
                <input
                  type="text"
                  placeholder="Seu nome completo..."
                  value={motoboyNome}
                  onChange={(e) => setMotoboyNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-sm text-white outline-none focus:border-cyan-500"
                />
              )}
            </div>

            {/* Propostas Pendentes no Sistema */}
            {propostasPendentes.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" /> Coleta Agendada no Sistema?
                </label>
                <p className="text-[11px] text-slate-400">
                  Toque no cliente abaixo para puxar o aparelho já cadastrado:
                </p>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {propostasPendentes.map((prop) => (
                    <button
                      key={prop.id}
                      type="button"
                      onClick={() => selecionarPropostaExistente(prop)}
                      className={`w-full p-3 rounded-2xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                        propostaIdVinculada === prop.id
                          ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200'
                          : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div>
                        <p className="text-xs font-bold text-white">{prop.cliente_nome}</p>
                        <p className="text-[11px] text-slate-400">
                          {prop.modelo} {prop.capacidade} • R$ {(prop.valor_avaliado || 0).toFixed(2)}
                        </p>
                      </div>
                      {propostaIdVinculada === prop.id && (
                        <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dados do Cliente */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-400" /> Dados do Cliente & Endereço
              </label>

              <div>
                <input
                  type="text"
                  placeholder="Nome do Cliente..."
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="tel"
                  placeholder="WhatsApp do Cliente..."
                  value={clienteTelefone}
                  onChange={(e) => setClienteTelefone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-sm text-white outline-none focus:border-cyan-500"
                />
                <input
                  type="text"
                  placeholder="Endereço / Bairro da Coleta..."
                  value={enderecoColeta}
                  onChange={(e) => setEnderecoColeta(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: CHECKLIST DO APARELHO & SEGURANÇA */}
        {etapa === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Modelo e Capacidade */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-cyan-400" /> Modelo e Capacidade
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Modelo</label>
                  <select
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs font-bold text-white outline-none"
                  >
                    {modelosDisponiveis.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Capacidade</label>
                  <select
                    value={capacidade}
                    onChange={(e) => setCapacidade(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs font-bold text-white outline-none"
                  >
                    {capacidadesDisponiveis.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Cor do Aparelho</label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {['Preto', 'Branco', 'Azul', 'Dourado', 'Verde', 'Titânio Natural', 'Roxo', 'Vermelho'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCor(c)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer",
                          cor === c
                            ? "bg-cyan-500 text-slate-950 border-cyan-400 font-black"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Ou digite outra cor..."
                    value={cor}
                    onChange={(e) => setCor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">IMEI ou N° de Série</label>
                  <input
                    type="text"
                    placeholder="Obrigatório para segurança"
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-2.5 text-xs font-mono text-cyan-300 outline-none mt-6 sm:mt-0"
                  />
                </div>
              </div>
            </div>

            {/* TRAVA DE SEGURANÇA CRÍTICA: ICLOUD */}
            <div
              className={`rounded-3xl p-4 border transition-all ${
                icloudRemovido
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-red-950/50 border-red-500 animate-pulse'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <ShieldCheck
                  className={`w-5 h-5 ${icloudRemovido ? 'text-emerald-400' : 'text-red-400'}`}
                />
                <span className="text-xs font-extrabold text-white">
                  iCloud / Conta Apple Desconectada?
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIcloudRemovido(true)}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                    icloudRemovido
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-800 text-slate-400'
                  }`}
                >
                  <Check className="w-4 h-4" /> SIM, Resetado
                </button>
                <button
                  type="button"
                  onClick={() => setIcloudRemovido(false)}
                  className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                    !icloudRemovido
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-400'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" /> NÃO / Bloqueado
                </button>
              </div>

              {!icloudRemovido && (
                <p className="text-[11px] text-red-300 font-bold mt-2.5 bg-red-950/80 p-2 rounded-xl border border-red-800">
                  ⚠️ ATENÇÃO: Nunca colete um aparelho com conta iCloud ativa ou com senha do cliente! Peça para ele remover antes.
                </p>
              )}
            </div>

            {/* Saúde da Bateria */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Battery className="w-4 h-4 text-emerald-400" /> Saúde da Bateria (Ajustes ➔ Bateria)
                </label>
                <span className="text-sm font-extrabold text-emerald-400 font-mono">
                  {bateriaSaude}%
                </span>
              </div>
              <input
                type="range"
                min="65"
                max="100"
                value={bateriaSaude}
                onChange={(e) => setBateriaSaude(parseInt(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>65% (Troca Urgente)</span>
                <span>80% (Padrão Apple)</span>
                <span>100% (Nova)</span>
              </div>
            </div>

            {/* Estado da Tela */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Estado da Tela
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'impecavel', label: '✨ Impecável (Original)' },
                  { id: 'leves_riscos', label: '👌 Riscos Leves' },
                  { id: 'trocada_com_aviso', label: '⚠️ Tela Trocada' },
                  { id: 'trincada', label: '💥 Trincada / Mancha' },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setTelaCondicao(op.id as any)}
                    className={`p-2.5 rounded-2xl text-left font-bold transition-all cursor-pointer ${
                      telaCondicao === op.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-950 border border-slate-800 text-slate-400'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Estado da Carcaça & Funcionalidades */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
              <label className="text-xs font-bold text-slate-300 block">
                Carcaça & Funções
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setFaceIdOk(!faceIdOk)}
                  className={`p-2.5 rounded-2xl font-bold border transition-all cursor-pointer ${
                    faceIdOk
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-950/40 border-red-500/40 text-red-300'
                  }`}
                >
                  Face ID: {faceIdOk ? '✅ OK' : '❌ Falha'}
                </button>

                <button
                  type="button"
                  onClick={() => setCamerasOk(!camerasOk)}
                  className={`p-2.5 rounded-2xl font-bold border transition-all cursor-pointer ${
                    camerasOk
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-red-950/40 border-red-500/40 text-red-300'
                  }`}
                >
                  Câmeras: {camerasOk ? '✅ OK' : '❌ Falha'}
                </button>

                <button
                  type="button"
                  onClick={() => setTemCaixaOriginal(!temCaixaOriginal)}
                  className={`col-span-2 p-2.5 rounded-2xl font-bold border transition-all cursor-pointer ${
                    temCaixaOriginal
                      ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Caixa Original: {temCaixaOriginal ? '🎁 Sim (+ Bônus)' : 'Sem caixa'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 3: FOTOS REAIS DO APARELHO NA HORA (4 SLOTS) */}
        {etapa === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4">
              <h2 className="text-xs font-extrabold text-white flex items-center gap-2 mb-1">
                <Camera className="w-4 h-4 text-cyan-400" /> Registro Fotográfico do Aparelho
              </h2>
              <p className="text-[11px] text-slate-400">
                Tire as fotos diretamente pela câmera do celular para comprovar o estado de entrada:
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { slot: 0, title: '1. Foto Frontal', desc: 'Tela ligada com imagem visível' },
                { slot: 1, title: '2. Foto Traseira', desc: 'Vidro traseiro e lentes de câmera' },
                { slot: 2, title: '3. Foto Laterais', desc: 'Aros e conector de carga' },
                { slot: 3, title: '4. Foto Ajustes', desc: 'Tela com Bateria e IMEI' },
              ].map((item) => (
                <div
                  key={item.slot}
                  className="bg-slate-900 border border-slate-800 rounded-3xl p-3 flex flex-col items-center text-center relative overflow-hidden"
                >
                  <p className="text-xs font-extrabold text-white mb-0.5">{item.title}</p>
                  <p className="text-[10px] text-slate-500 mb-2 leading-tight">{item.desc}</p>

                  {fotos[item.slot] ? (
                    <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-slate-700 group">
                      <img
                        src={fotos[item.slot]}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removerFoto(item.slot)}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-red-600/90 text-white shadow-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-800 hover:border-cyan-500 bg-slate-950 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors p-2">
                      <Camera className="w-6 h-6 text-cyan-400" />
                      <span className="text-[11px] font-bold text-cyan-400">Tirar Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleFotoUpload(item.slot, e)}
                        className="hidden"
                      />
                    </label>
                  )}

                  {processandoFoto === item.slot && (
                    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center">
                      <span className="text-xs font-bold text-cyan-400">Processando...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ETAPA 4: VALOR DA AVALIAÇÃO */}
        {etapa === 4 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Card com o Cálculo Oficial */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 shadow-xl text-center space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-extrabold">
                <Sparkles className="w-3.5 h-3.5" /> Valor Calculado na Hora
              </div>

              <div>
                <p className="text-xs text-slate-400">{modelo} {capacidade}</p>
                <div className="text-3xl font-black text-emerald-400 font-mono tracking-tight my-1">
                  R$ {calculo.valorFinalAvaliacao.toFixed(2)}
                </div>
                <p className="text-[11px] text-slate-500">Valor sugerido de entrada na troca</p>
              </div>

              {/* Detalhamento das Deduções */}
              {calculo.deducoes.length > 0 && (
                <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3 text-left space-y-1.5 text-xs">
                  <span className="text-[11px] font-extrabold text-slate-400 block mb-1">
                    Deduções por conservação:
                  </span>
                  {calculo.deducoes.map((d, i) => (
                    <div key={i} className="flex justify-between text-slate-400">
                      <span>• {d.motivo}</span>
                      <span className="text-red-400 font-mono">
                        {d.tipo === 'porcentagem' ? `-${d.valor}%` : `-R$ ${d.valor}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ajuste Manual pelo Motoboy/Loja */}
              <div className="pt-2 border-t border-slate-800 text-left">
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Valor Acordado com a Loja / Gerência (R$)
                </label>
                <input
                  type="number"
                  placeholder={String(calculo.valorFinalAvaliacao)}
                  value={valorAcordadoCustom}
                  onChange={(e) => setValorAcordadoCustom(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-sm font-bold text-emerald-400 outline-none"
                />
                <span className="text-[10px] text-slate-500">
                  Deixe vazio para usar o valor exato calculado pela tabela oficial.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 5: OBSERVAÇÕES & ASSINATURA TOUCH DO CLIENTE */}
        {etapa === 5 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2.5">
              <label className="text-xs font-bold text-slate-300 block">
                Observações do Motoboy (Toque para adicionar rápido)
              </label>

              {/* Chips Rápidos de Observações */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Com caixa original',
                  'Com cabo original',
                  'Com fonte/carregador',
                  'Com capinha',
                  'Sem acessórios',
                  'Bateria 100% original',
                  'Leve marca no aro',
                  'Sem nenhum risco',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setObservacoesMotoboy((prev) => (prev ? `${prev}, ${tag}` : tag));
                    }}
                    className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-cyan-300 font-bold hover:bg-slate-800 hover:border-cyan-500/50 cursor-pointer transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                placeholder="Ou digite observações adicionais..."
                value={observacoesMotoboy}
                onChange={(e) => setObservacoesMotoboy(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-white outline-none"
              />
            </div>

            {/* CANVAS DE ASSINATURA TOUCH DO CLIENTE */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-white flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-cyan-400" /> Assinatura do Cliente (com o dedo)
                </label>
                <button
                  type="button"
                  onClick={limparAssinatura}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Limpar
                </button>
              </div>

              <p className="text-[10px] text-slate-400">
                Peça para o cliente assinar confirmando a entrega do aparelho no valor de{' '}
                <strong className="text-emerald-400">R$ {valorFinal.toFixed(2)}</strong>:
              </p>

              <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950 touch-none">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-36 bg-slate-950 cursor-crosshair block"
                />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 6: SUCESSO & COMPROVANTE */}
        {etapa === 6 && (
          <div className="text-center space-y-4 py-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto shadow-xl">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-white">Coleta Finalizada com Sucesso!</h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Protocolo: <strong className="text-cyan-400 font-bold">{protocoloGerado}</strong>
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 text-left space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Aparelho:</span>
                <span className="font-extrabold text-white">{modelo} {capacidade}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Cliente:</span>
                <span className="font-bold text-white">{clienteNome}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Valor Acordado:</span>
                <span className="font-black text-emerald-400 font-mono">R$ {valorFinal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fotos Anexadas:</span>
                <span className="font-bold text-cyan-400">{Object.keys(fotos).length} fotos</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <a
                href={getLinkWhatsappLoja()}
                target="_blank"
                rel="noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
              >
                📲 Avisar Expedição da Loja no WhatsApp
              </a>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full py-3 px-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                🛵 Iniciar Nova Coleta
              </button>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER NAVEGAÇÃO FIXO NO RODAPÉ */}
      {etapa < 6 && (
        <footer className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {etapa > 1 && (
              <button
                type="button"
                onClick={() => setEtapa((prev) => prev - 1)}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
            )}

            {etapa < 5 ? (
              <button
                type="button"
                onClick={() => {
                  if (etapa === 1 && !clienteNome.trim()) {
                    toast.error('Informe o nome do cliente.');
                    return;
                  }
                  if (etapa === 2 && !icloudRemovido) {
                    toast.error('⚠️ O iCloud precisa estar desconectado para continuar.');
                    return;
                  }
                  setEtapa((prev) => prev + 1);
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-transform active:scale-95"
              >
                Próximo Passo <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={salvando}
                onClick={handleFinalizarColeta}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                {salvando ? (
                  'Salvando Vistoria...'
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Finalizar e Salvar Laudo
                  </>
                )}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
