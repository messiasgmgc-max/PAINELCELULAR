'use client';

import { useState } from 'react';
import { 
  CheckCircle2, 
  Sparkles, 
  Zap, 
  ShieldCheck, 
  Smartphone, 
  CreditCard, 
  QrCode, 
  Gift, 
  ArrowRight, 
  Building2, 
  User, 
  Mail, 
  Lock, 
  Phone, 
  MapPin, 
  Instagram, 
  MessageCircle, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  Check, 
  Copy, 
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  PLANOS_SISTEMA, 
  TipoPlano, 
  PeriodoFaturamento, 
  calcularValoresPlano, 
  obterPlanoPorTipo,
  WHATSAPP_SUPORTE_URL 
} from '@/lib/planos-config';

export default function AssinarPage() {
  // Configuração de Plano e Ciclo
  const [planoSelecionado, setPlanoSelecionado] = useState<TipoPlano>('intermediario');
  const [periodoSelecionado, setPeriodoSelecionado] = useState<PeriodoFaturamento>('mensal');
  const [modalidade, setModalidade] = useState<'trial' | 'pix' | 'cartao'>('trial');

  // Dados do Formulário
  const [formData, setFormData] = useState({
    nomeLoja: '',
    nomeProprietario: '',
    whatsapp: '',
    email: '',
    senha: '',
    cidade: '',
    estado: 'SP',
    instagram: ''
  });

  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [cadastroConcluido, setCadastroConcluido] = useState<{
    sucesso: boolean;
    lojaId: string;
    userId: string;
    mensagem: string;
    checkoutUrl?: string;
    pixData?: any;
  } | null>(null);

  const [pixCopiado, setPixCopiado] = useState(false);
  const [faqAberto, setFaqAberto] = useState<number | null>(null);
  const [vendasMensais, setVendasMensais] = useState<number>(45);
  const prejuizoEstimadoSemBot = Math.round(vendasMensais * 38.5);

  const infoCalculo = calcularValoresPlano(planoSelecionado, periodoSelecionado);

  const handleInputChange = (field: string, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleCadastrar = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nomeLoja.trim()) {
      toast.error('Informe o nome da sua loja');
      return;
    }
    if (!formData.whatsapp.trim() || formData.whatsapp.replace(/\D/g, '').length < 10) {
      toast.error('Informe um WhatsApp válido com DDD');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    if (!formData.senha || formData.senha.length < 6) {
      toast.error('A senha de acesso deve ter pelo menos 6 caracteres');
      return;
    }

    try {
      setLoadingSubmit(true);

      const res = await fetch('/api/lojas/criar-com-adesao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          plano: planoSelecionado,
          periodo: periodoSelecionado,
          modalidade
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar conta da loja');
      }

      setCadastroConcluido({
        sucesso: true,
        lojaId: data.lojaId,
        userId: data.userId,
        mensagem: data.mensagem || 'Loja cadastrada com sucesso!'
      });

      toast.success('🎉 Sua loja foi criada com sucesso!');

      if (modalidade === 'cartao') {
        try {
          const cardRes = await fetch('/api/planos/pagar-cartao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lojaId: data.lojaId,
              plano: planoSelecionado,
              periodo: periodoSelecionado,
              email: formData.email,
              nome: formData.nomeProprietario || formData.nomeLoja
            })
          });
          const cardData = await cardRes.json();
          if (cardData.checkoutUrl) {
            setCadastroConcluido(prev => prev ? { ...prev, checkoutUrl: cardData.checkoutUrl } : null);
            toast.info('Abrindo checkout seguro de cartão de crédito...');
            window.open(cardData.checkoutUrl, '_blank');
          }
        } catch (cErr) {
          console.warn('Erro ao gerar link de cartão:', cErr);
        }
      }

      if (modalidade === 'pix') {
        try {
          const pixRes = await fetch('/api/planos/gerar-pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lojaId: data.lojaId,
              valor: infoCalculo.valorTotal,
              plano: planoSelecionado,
              periodo: periodoSelecionado,
              email: formData.email,
              nome: formData.nomeProprietario || formData.nomeLoja
            })
          });
          const pixResData = await pixRes.json();
          if (pixResData.success) {
            setCadastroConcluido(prev => prev ? { ...prev, pixData: pixResData } : null);
          }
        } catch (pErr) {
          console.warn('Erro ao gerar PIX pós-cadastro:', pErr);
        }
      }

    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar cadastro');
    } finally {
      setLoadingSubmit(false);
    }
  };

  const faqs = [
    {
      p: 'Preciso deixar o computador ou WhatsApp Web aberto para o robô funcionar?',
      r: 'Não! O robô do Phone Center roda 24 horas por dia em nossos servidores de nuvem de alta velocidade. Mesmo se seu celular desligar ou seu computador estiver fechado, seus clientes recebem preços e estoques instantaneamente.'
    },
    {
      p: 'Como funciona o teste de 3 dias gratuitos?',
      r: 'Você cria o acesso da sua loja agora e recebe 3 dias de acesso total e irrestrito sem precisar cadastrar cartão de crédito. Você pode testar o robô no WhatsApp, cadastrar seu estoque e fazer vendas reais imediatamente.'
    },
    {
      p: 'Qual a diferença entre os planos Entrada, Intermediário e Avançado?',
      r: 'O plano Entrada (R$ 99,90) é perfeito para quem quer o robô ágil de vendas, estoque e o painel web. O Intermediário (R$ 189) inclui o controle automatizado de fiado/devedores com !abater e !saldo, além de checagem de IMEI e broadcast para grupos. O Avançado (R$ 299) inclui escuta em grupos de parceiros multi-loja, auditoria completa e API REST para integrações.'
    },
    {
      p: 'Posso parcelar o pagamento no cartão de crédito?',
      r: 'Sim! Aceitamos pagamentos via PIX com ativação instantânea e cartão de crédito em até 12 vezes com a segurança oficial do Mercado Pago.'
    },
    {
      p: 'Consigo importar meu estoque atual de planilhas ou de outro sistema?',
      r: 'Sim! Você pode cadastrar aparelhos em lote, tirar foto da etiqueta de garantia com nosso leitor OCR inteligente (IA Vision) ou importar sua lista de produtos.'
    },
    {
      p: 'Tem fidelidade ou multa de cancelamento?',
      r: 'Nenhuma fidelidade. Você pode cancelar ou mudar de plano quando desejar direto pelo seu painel, sem taxas escondidas.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white relative overflow-x-hidden font-sans">
      
      {/* Luzes de Fundo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-gradient-to-b from-blue-600/15 via-indigo-600/10 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[400px] right-0 w-96 h-96 bg-purple-600/10 blur-3xl pointer-events-none -z-10" />

      {/* Barra de Navegação */}
      <nav className="w-full border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
              <Smartphone className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <span className="font-black text-sm sm:text-lg text-white tracking-tight">PHONE CENTER</span>
              <span className="text-[9px] sm:text-[10px] text-blue-400 font-bold block leading-none">SISTEMA &amp; BOT WHATSAPP</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-2 rounded-xl transition"
            >
              Entrar
            </a>
            <a
              href="#formulario"
              className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl shadow-md shadow-blue-600/20 transition"
            >
              Criar Grátis
            </a>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="pt-8 sm:pt-12 pb-10 sm:pb-16 px-4 sm:px-6 max-w-5xl mx-auto text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[11px] font-bold animate-pulse">
          <Sparkles className="w-3 h-3" />
          O Sistema Especialista em Lojas de iPhone &amp; Eletrônicos
        </div>

        <h1 className="text-2xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
          Pare de perder vendas enquanto procura preço em tabelas.{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            Seu estoque responde no WhatsApp na hora.
          </span>
        </h1>

        <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Atenda clientes e lojistas parceiros em grupos com velocidade relâmpago, controle fiado sem erros de caderno e dê baixa em estoque por foto de etiqueta com IA.
        </p>

        {/* Badges de Destaque — scroll horizontal no mobile */}
        <div className="flex items-center justify-start sm:justify-center gap-2 pt-1 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
          {[
            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />, text: '3 Dias Grátis' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />, text: 'Sem Cartão Inicial' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />, text: 'Ativo em 2 Minutos' },
          ].map((b, i) => (
            <span key={i} className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 text-xs font-semibold text-slate-300 whitespace-nowrap shrink-0">
              {b.icon} {b.text}
            </span>
          ))}
        </div>

        <div className="pt-2">
          <a
            href="#formulario"
            className="inline-flex items-center gap-2 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-sm sm:text-base shadow-xl shadow-blue-500/25 transition-all hover:scale-[1.02]"
          >
            Começar Teste Grátis <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>
        </div>
      </section>

      {/* CALCULADORA DE PREJUÍZO EVITADO (ROI) */}
      <section className="py-6 sm:py-10 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col gap-5">
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Calculadora de Oportunidade Perdida
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-white">
                Quanto sua loja perde todo mês por demora no WhatsApp?
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Quando um cliente pede um iPhone e você demora mais de 3 minutos, ele já comprou de outro lojista.
              </p>

              <div className="pt-2 space-y-2">
                <div className="flex justify-between text-xs text-slate-300 font-bold">
                  <span>Aparelhos vendidos por mês:</span>
                  <span className="text-blue-400 font-mono">{vendasMensais}/mês</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={vendasMensais}
                  onChange={(e) => setVendasMensais(Number(e.target.value))}
                  className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            <div className="bg-slate-950/90 border border-red-500/30 rounded-2xl p-5 text-center space-y-2 shadow-lg shadow-red-500/5">
              <span className="text-xs text-slate-400 font-semibold">Perda estimada por mês:</span>
              <div className="text-3xl sm:text-4xl font-black text-red-400 font-mono">
                R$ {prejuizoEstimadoSemBot.toLocaleString('pt-BR')},00
              </div>
              <p className="text-[11px] text-slate-400">
                O robô custa a partir de <strong>R$ 99,90/mês</strong> e se paga na <strong>primeira venda</strong> que você não perde.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE PLANOS & PREÇOS */}
      <section id="planos" className="py-8 sm:py-12 px-4 sm:px-6 max-w-6xl mx-auto space-y-6 sm:space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-4xl font-black text-white">
            Planos para qualquer tamanho de loja
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Escolha o plano ideal. Todos com suporte especializado. Mude quando quiser.
          </p>

          {/* Toggle de Ciclos */}
          <div className="pt-4 flex items-center justify-center">
            <div className="bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 inline-flex items-center gap-1 shadow-inner">
              {([
                { key: 'mensal', label: 'Mensal', badge: null },
                { key: 'trimestral', label: 'Trimestral', badge: '-10%' },
                { key: 'anual', label: 'Anual', badge: '-20%' },
              ] as { key: PeriodoFaturamento; label: string; badge: string | null }[]).map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriodoSelecionado(opt.key)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                    periodoSelecionado === opt.key ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                  {opt.badge && (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-mono font-bold">
                      {opt.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cards dos Planos — scroll horizontal no mobile */}
        <div className="flex sm:grid sm:grid-cols-3 gap-4 overflow-x-auto pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none snap-x snap-mandatory">
          {(Object.keys(PLANOS_SISTEMA) as TipoPlano[]).map((chave) => {
            const p = PLANOS_SISTEMA[chave];
            const precoObj = p.precos[periodoSelecionado];
            const isSelected = planoSelecionado === chave;

            return (
              <div
                key={chave}
                onClick={() => setPlanoSelecionado(chave)}
                className={`relative rounded-3xl p-5 sm:p-6 border flex flex-col justify-between transition-all duration-200 cursor-pointer shrink-0 w-[80vw] sm:w-auto snap-start ${
                  p.popular 
                    ? 'bg-gradient-to-b from-blue-950/60 via-slate-900 to-slate-950 border-blue-500/60 shadow-2xl shadow-blue-500/10 ring-2 ring-blue-500/40' 
                    : isSelected
                      ? 'bg-slate-950/90 border-emerald-500/60 ring-2 ring-emerald-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md whitespace-nowrap">
                    Mais Escolhido
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg sm:text-xl font-black text-white">{p.nome}</h3>
                    {p.badge && (
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-300 font-bold">
                        {p.badge}
                      </span>
                    )}
                  </div>

                  <div className="my-3 sm:my-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm text-slate-400 font-semibold">R$</span>
                      <span className="text-3xl sm:text-4xl font-black text-white font-mono">
                        {precoObj.valorMensal.toFixed(2).replace('.', ',')}
                      </span>
                      <span className="text-xs text-slate-400">/mês</span>
                    </div>
                    {periodoSelecionado !== 'mensal' && (
                      <p className="text-xs text-emerald-400 font-semibold mt-1">
                        Faturado R$ {precoObj.valorTotal.toFixed(2).replace('.', ',')} a cada {precoObj.diasValidade} dias
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed min-h-[40px]">
                      {p.descricao}
                    </p>
                  </div>

                  <div className="space-y-2 py-3 border-t border-slate-800/80">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Incluso:</span>
                    {p.beneficios.map((ben, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{ben}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80">
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlanoSelecionado(chave);
                      const el = document.getElementById('formulario');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`w-full h-11 text-xs font-black rounded-xl gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isSelected ? '✓ Selecionado' : 'Selecionar'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Indicador de swipe no mobile */}
        <p className="text-center text-[11px] text-slate-500 sm:hidden flex items-center justify-center gap-1.5">
          ← Deslize para ver os planos →
        </p>
      </section>

      {/* FORMULÁRIO DE CADASTRO E CHECKOUT */}
      <section id="formulario" className="py-10 sm:py-16 px-4 sm:px-6 max-w-3xl mx-auto">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-10 shadow-2xl space-y-6 sm:space-y-8">
          
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <Gift className="w-3.5 h-3.5" /> 3 Dias Grátis com Liberação Imediata
            </div>
            <h2 className="text-xl sm:text-3xl font-black text-white">
              Crie o acesso da sua loja agora mesmo
            </h2>
            <p className="text-xs text-slate-400">
              Preencha os dados abaixo para ativar o sistema e conectar o robô do WhatsApp.
            </p>
          </div>

          {/* Resumo do Plano Selecionado */}
          <div className="bg-slate-950/80 border border-blue-500/30 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Plano Escolhido:</span>
                <h3 className="text-sm sm:text-base font-black text-white flex flex-wrap items-center gap-2 mt-0.5">
                  Plano {obterPlanoPorTipo(planoSelecionado).nome}
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 text-[10px] uppercase font-mono">
                    Ciclo {periodoSelecionado}
                  </Badge>
                </h3>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Valor:</span>
                <p className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                  R$ {infoCalculo.valorTotal.toFixed(2).replace('.', ',')}
                </p>
              </div>
            </div>
            <a href="#planos" className="text-[11px] text-blue-400 underline text-center sm:text-left">
              Trocar plano
            </a>
          </div>

          {cadastroConcluido ? (
            /* Card de Sucesso Pós-Cadastro */
            <div className="bg-slate-950/90 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10 animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white">Sua Loja Foi Criada!</h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto">
                {cadastroConcluido.mensagem} Seus dados de login foram configurados com o e-mail <strong>{formData.email}</strong>.
              </p>

              {cadastroConcluido.pixData && (
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 max-w-xs mx-auto">
                  <span className="text-xs font-bold text-emerald-400 block">QR Code PIX para Liberação:</span>
                  {cadastroConcluido.pixData.qrCodeBase64 ? (
                    <img 
                      src={`data:image/png;base64,${cadastroConcluido.pixData.qrCodeBase64}`} 
                      alt="QR Code Pix" 
                      className="w-44 h-44 object-contain bg-white p-2 rounded-xl mx-auto shadow"
                    />
                  ) : (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cadastroConcluido.pixData.qrCode || cadastroConcluido.pixData.chavePix)}`} 
                      alt="QR Code Pix" 
                      className="w-44 h-44 object-contain bg-white p-2 rounded-xl mx-auto shadow"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(cadastroConcluido.pixData.qrCode || cadastroConcluido.pixData.chavePix);
                      setPixCopiado(true);
                      toast.success('Código PIX Copiado!');
                      setTimeout(() => setPixCopiado(false), 2500);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
                  >
                    {pixCopiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {pixCopiado ? 'Código Copiado!' : 'Copiar Código Pix'}
                  </Button>
                </div>
              )}

              {cadastroConcluido.checkoutUrl && (
                <div className="pt-2">
                  <a
                    href={cadastroConcluido.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20"
                  >
                    <CreditCard className="w-4 h-4" /> Finalizar Pagamento no Mercado Pago
                  </a>
                </div>
              )}

              <div className="pt-4 flex flex-col gap-3">
                <a
                  href="/login"
                  className="w-full px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-600/20 transition text-center"
                >
                  Entrar no Painel 🚀
                </a>
                <a
                  href={WHATSAPP_SUPORTE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400" /> Chamar Especialista no WhatsApp
                </a>
              </div>
            </div>
          ) : (
            /* Formulário Ativo */
            <form onSubmit={handleCadastrar} className="space-y-5">
              
              {/* Escolha da Modalidade */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Como prefere iniciar?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalidade('trial')}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      modalidade === 'trial'
                        ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500/40 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Gift className={`w-4 h-4 ${modalidade === 'trial' ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span className="text-[11px] font-bold leading-tight">3 Dias Grátis</span>
                    <span className="text-[10px] text-slate-400 leading-tight">Sem cartão</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalidade('pix')}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      modalidade === 'pix'
                        ? 'bg-emerald-600/20 border-emerald-500 ring-1 ring-emerald-500/40 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <QrCode className={`w-4 h-4 ${modalidade === 'pix' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span className="text-[11px] font-bold leading-tight">PIX Rápido</span>
                    <span className="text-[10px] text-slate-400 leading-tight">Liberação em 10s</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalidade('cartao')}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      modalidade === 'cartao'
                        ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500/40 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <CreditCard className={`w-4 h-4 ${modalidade === 'cartao' ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span className="text-[11px] font-bold leading-tight">Cartão 12x</span>
                    <span className="text-[10px] text-slate-400 leading-tight">Mercado Pago</span>
                  </button>
                </div>
              </div>

              {/* Campos do Formulário */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                
                {/* Nome da Loja */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" /> Nome da Loja *
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="organization"
                    value={formData.nomeLoja}
                    onChange={(e) => handleInputChange('nomeLoja', e.target.value)}
                    placeholder="Ex: Lucas Imports"
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* Nome do Responsável */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-blue-400" /> Seu Nome
                  </label>
                  <input
                    type="text"
                    autoComplete="name"
                    value={formData.nomeProprietario}
                    onChange={(e) => handleInputChange('nomeProprietario', e.target.value)}
                    placeholder="Ex: Lucas Gabriel"
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" /> WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    value={formData.whatsapp}
                    onChange={(e) => handleInputChange('whatsapp', e.target.value)}
                    placeholder="31 99999-9999"
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                {/* E-mail */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-400" /> E-mail de Login *
                  </label>
                  <input
                    type="email"
                    required
                    inputMode="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="contato@sualoja.com.br"
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* Senha */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-blue-400" /> Senha (mín. 6 dígitos) *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={formData.senha}
                    onChange={(e) => handleInputChange('senha', e.target.value)}
                    placeholder="Crie sua senha segura..."
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* Instagram */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Instagram className="w-3.5 h-3.5 text-pink-400" /> Instagram (@opcional)
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={formData.instagram}
                    onChange={(e) => handleInputChange('instagram', e.target.value)}
                    placeholder="@sualoja.iphones"
                    className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-500 transition"
                  />
                </div>

                {/* Cidade / Estado */}
                <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" /> Cidade
                    </label>
                    <input
                      type="text"
                      autoComplete="address-level2"
                      value={formData.cidade}
                      onChange={(e) => handleInputChange('cidade', e.target.value)}
                      placeholder="Belo Horizonte"
                      className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">UF</label>
                    <input
                      type="text"
                      maxLength={2}
                      autoComplete="address-level1"
                      value={formData.estado}
                      onChange={(e) => handleInputChange('estado', e.target.value.toUpperCase())}
                      placeholder="MG"
                      className="w-full h-12 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 text-sm text-slate-100 font-mono text-center focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>
                </div>

              </div>

              {/* Botão de Envio */}
              <Button
                type="submit"
                disabled={loadingSubmit}
                className="w-full h-14 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-600/30 gap-2 cursor-pointer transition-all hover:scale-[1.01]"
              >
                {loadingSubmit ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Configurando sua loja...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 text-amber-300" />
                    {modalidade === 'trial' 
                      ? 'Liberar Acesso Grátis de 3 Dias'
                      : modalidade === 'pix'
                        ? `Gerar PIX e Ativar (R$ ${infoCalculo.valorTotal.toFixed(2).replace('.', ',')})`
                        : `Pagar no Cartão (R$ ${infoCalculo.valorTotal.toFixed(2).replace('.', ',')})`
                    }
                  </>
                )}
              </Button>

              <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Dados protegidos com criptografia ponta a ponta.</span>
              </div>
            </form>
          )}

        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="py-8 sm:py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Depoimentos Reais</span>
          <h2 className="text-xl sm:text-3xl font-black text-white">
            Quem usa Phone Center não volta pro caderno
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-slate-900/60 border border-slate-800 p-5 sm:p-6 rounded-3xl space-y-4">
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed italic">
              "A velocidade do robô responder nos grupos do WhatsApp salvou meu dia a dia. Antes eu perdia pelo menos 2 a 3 vendas por dia. Hoje o cliente pergunta e o robô responde em 2 segundos."
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center font-bold text-blue-400 text-sm shrink-0">
                LI
              </div>
              <div>
                <strong className="text-xs text-white block">Lucas Imports</strong>
                <span className="text-[11px] text-slate-400">Revendedor de iPhones — BH</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-5 sm:p-6 rounded-3xl space-y-4">
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed italic">
              "A função de fiado e devedores com !abater e !saldo eliminou todas as dores de cabeça com cobrança. Os lojistas parceiros recebem o comprovante automático no WhatsApp."
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 text-sm shrink-0">
                CC
              </div>
              <div>
                <strong className="text-xs text-white block">Center Celulares &amp; Acessórios</strong>
                <span className="text-[11px] text-slate-400">Loja &amp; Assistência Técnica</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-8 sm:py-12 px-4 sm:px-6 max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Tire Suas Dúvidas</span>
          <h2 className="text-xl sm:text-3xl font-black text-white">
            Perguntas Frequentes
          </h2>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, idx) => {
            const isAberto = faqAberto === idx;
            return (
              <div
                key={idx}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setFaqAberto(isAberto ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-white hover:text-blue-300 transition cursor-pointer min-h-[56px]"
                >
                  <span className="leading-snug">{faq.p}</span>
                  {isAberto 
                    ? <ChevronUp className="w-4 h-4 text-blue-400 shrink-0" /> 
                    : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                </button>
                {isAberto && (
                  <div className="px-4 sm:px-5 pb-5 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3">
                    {faq.r}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA FINAL MOBILE — barra sticky só no mobile */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 px-4 py-3 flex gap-3">
        <a
          href={WHATSAPP_SUPORTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shrink-0"
          aria-label="Suporte WhatsApp"
        >
          <MessageCircle className="w-5 h-5" />
        </a>
        <a
          href="#formulario"
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm shadow-lg shadow-blue-600/30"
        >
          <Zap className="w-4 h-4 text-amber-300" /> Criar Loja Grátis
        </a>
      </div>

      {/* BOTÃO FLUTUANTE WHATSAPP — apenas desktop */}
      <div className="hidden sm:block fixed bottom-5 right-5 z-50">
        <a
          href={WHATSAPP_SUPORTE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-2xl shadow-emerald-600/40 font-bold text-xs transition-all hover:scale-105"
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-white rounded-full" />
          </div>
          <span>Dúvidas? Fale no WhatsApp</span>
        </a>
      </div>

      {/* Espaço extra no mobile para a barra sticky */}
      <div className="h-20 sm:h-0" />

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>© {new Date().getFullYear()} Phone Center. Todos os direitos reservados.</p>
        <p>Desenvolvido para lojistas de eletrônicos e assistências técnicas no Brasil.</p>
      </footer>

    </div>
  );
}
