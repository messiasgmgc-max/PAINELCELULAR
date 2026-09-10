'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact, type ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  PackagePlus,
  Repeat,
  ShoppingCart,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/GlassCard';
import { ModalPortal } from '@/components/ModalPortal';
import type { Aparelho } from '@/lib/db/types';
import { registrarLog } from '@/lib/logger';
import { isAparelhoEmManutencao } from '@/lib/manutencao';
import { supabase } from '@/lib/supabaseClient';
import { cn, formatarSaudeBateria } from '@/lib/utils';
import {
  ACESSORIOS_RAPIDOS,
  CONDICOES_RAPIDAS,
  ErroCadastroRapido,
  buscarModelos,
  cadastrarAparelhoRapido,
  calcularMargem,
  capacidadeMaisComum,
  capacidadesDoModelo,
  coresSugeridas,
  derivarMarca,
  formularioVazio,
  gerarCodigoEtiqueta,
  interpretarIdentificador,
  listarOpcoesModelo,
  montarPayloadCadastroRapido,
  normalizarModelo,
  procurarDuplicado,
  resolverIdentificadores,
  sugerirPorTac,
  sugerirPreco,
  validarCadastroRapido,
  type CampoCadastro,
  type CondicaoRapida,
  type FormCadastroRapido,
  type PayloadCadastroRapido,
  type RegistroExistente,
} from '@/lib/pdv/cadastroRapido';

/**
 * Cadastro rápido de aparelho dentro do PDV.
 *
 * Meta: bipar o IMEI e colocar o aparelho na venda em poucos segundos, sem
 * mouse. Toda a regra (IMEI, sugestões, duplicidade, payload) está em
 * src/lib/pdv/cadastroRapido.ts; aqui fica só a tela e o teclado.
 */

const MARGEM_VAREJO_PADRAO = 300;
const MARGEM_ATACADO_PADRAO = 150;
const MARGEM_MINIMA_PERCENTUAL = 8;
const CHAVE_DETALHES = 'pdv:cadastro-rapido:detalhes';
const CHAVE_ULTIMO = 'pdv:cadastro-rapido:ultimo';
const CHIPS_BATERIA = [100, 95, 90, 85, 80];

type Campo = CampoCadastro | 'cor';
type ModoConclusao = 'adicionar' | 'cadastrar';

interface UltimoCadastro {
  modelo: string;
  marca: string;
  capacidade: string | null;
  condicao: CondicaoRapida;
  cor: string | null;
  custo: number | null;
  preco: number;
}

export interface NovoAparelhoRapidoModalProps {
  aberto: boolean;
  onFechar: () => void;
  aparelhos: Aparelho[];
  carrinhoAparelhoIds: string[];
  podeVerFinanceiro: boolean;
  usuario: { id?: string | null; nome?: string | null; email?: string | null; lojaId?: string | null } | null;
  /** Termo que levou ao cadastro: IMEI bipado sem resultado ou texto buscado no combobox. */
  valoresIniciais?: { identificador?: string; modelo?: string } | null;
  /** Leitura da câmera do PDV. `seq` muda a cada leitura, mesmo que o código se repita. */
  codigoEscaneado?: { valor: string; seq: number } | null;
  onAbrirScanner?: () => void;
  /** Com a câmera aberta por cima, as teclas são dela. */
  scannerAberto?: boolean;
  /** Insere o aparelho e lança erro com a mensagem real do banco em caso de falha. */
  criarAparelho: (payload: PayloadCadastroRapido) => Promise<Aparelho>;
  onUsarExistente: (aparelho: Aparelho) => void;
  onConcluido: (aparelho: Aparelho, modo: ModoConclusao) => void;
}

function lerLocal(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravarLocal(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // Sem armazenamento local (aba privada, bloqueio do navegador): só não lembra a preferência.
  }
}

const dinheiro = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mascaraDinheiro = (valor: number | null) =>
  valor === null ? '' : valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerDinheiro = (texto: string): number | null => {
  const digitos = texto.replace(/\D/g, '');
  return digitos ? Number(digitos) / 100 : null;
};

function descreverAparelho(a: Aparelho): string {
  return [a.marca, a.modelo, a.capacidade, a.cor].filter((parte) => parte && parte !== 'N/A').join(' ');
}

function dataCurta(valor: unknown): string {
  if (!valor) return '';
  const data = new Date(String(valor));
  return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
}

function Rotulo({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-1.5 flex min-h-[1.5rem] items-center justify-between gap-2">
      <span className="ml-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{children}</span>
      {extra}
    </div>
  );
}

function ErroCampo({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <p className="ml-1 mt-1 text-xs font-medium text-rose-400">{mensagem}</p>;
}

function Chip({
  ativo,
  onClick,
  children,
  titulo,
}: {
  ativo?: boolean;
  onClick: () => void;
  children: ReactNode;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      title={titulo}
      aria-pressed={Boolean(ativo)}
      onClick={onClick}
      className={cn(
        'h-10 min-w-[3rem] rounded-xl border px-3 text-sm font-semibold transition-colors',
        ativo
          ? 'border-blue-500 bg-blue-600 text-white shadow-sm'
          : 'border-slate-400/30 bg-slate-500/10 text-foreground hover:bg-slate-500/20'
      )}
    >
      {children}
    </button>
  );
}

export function NovoAparelhoRapidoModal({
  aberto,
  onFechar,
  aparelhos,
  carrinhoAparelhoIds,
  podeVerFinanceiro,
  usuario,
  valoresIniciais,
  codigoEscaneado,
  onAbrirScanner,
  scannerAberto,
  criarAparelho,
  onUsarExistente,
  onConcluido,
}: NovoAparelhoRapidoModalProps) {
  const [form, setForm] = useState<FormCadastroRapido>(() => formularioVazio());
  const [marcaEditada, setMarcaEditada] = useState(false);
  const [editandoMarca, setEditandoMarca] = useState(false);
  const [precoEditado, setPrecoEditado] = useState(false);
  /** Quantos aparelhos da loja embasaram o modelo sugerido pelo IMEI (null = modelo não veio do IMEI). */
  const [baseTac, setBaseTac] = useState<number | null>(null);
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [salvando, setSalvando] = useState<ModoConclusao | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<'prejuizo' | 'descartar' | null>(null);
  const [modoPendente, setModoPendente] = useState<ModoConclusao>('adicionar');
  const [existenteNoServidor, setExistenteNoServidor] = useState<RegistroExistente | null>(null);
  const [recompraAceita, setRecompraAceita] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const [maisDetalhes, setMaisDetalhes] = useState(false);
  const [temUltimo, setTemUltimo] = useState(false);

  const painelRef = useRef<HTMLDivElement>(null);
  const identificadorRef = useRef<HTMLInputElement>(null);
  const modeloRef = useRef<HTMLInputElement>(null);
  const marcaRef = useRef<HTMLInputElement>(null);
  const capacidadeRef = useRef<HTMLDivElement>(null);
  const condicaoRef = useRef<HTMLDivElement>(null);
  const bateriaRef = useRef<HTMLInputElement>(null);
  const corRef = useRef<HTMLInputElement>(null);
  const custoRef = useRef<HTMLInputElement>(null);
  const precoRef = useRef<HTMLInputElement>(null);
  const precoAtacadoRef = useRef<HTMLInputElement>(null);
  const ultimaLeituraRef = useRef<number | null>(null);

  // ── Derivados (tudo em memória: abrir o popup não faz nenhuma consulta) ──
  const opcoesModelo = useMemo(() => listarOpcoesModelo(aparelhos), [aparelhos]);
  const sugestoesModelo = useMemo(() => buscarModelos(form.modelo, opcoesModelo, 8), [form.modelo, opcoesModelo]);
  const { imei, numeroSerie, leitura } = useMemo(() => resolverIdentificadores(form), [form]);
  const duplicidade = useMemo(
    () =>
      procurarDuplicado({ imei, numeroSerie }, aparelhos, {
        carrinhoIds: carrinhoAparelhoIds,
        emManutencao: (a) => a.status === 'manutencao' || isAparelhoEmManutencao(a),
      }),
    [imei, numeroSerie, aparelhos, carrinhoAparelhoIds]
  );
  const capacidades = useMemo(() => {
    const doModelo = capacidadesDoModelo(form.modelo);
    return form.capacidade && !doModelo.includes(form.capacidade) ? [...doModelo, form.capacidade] : doModelo;
  }, [form.modelo, form.capacidade]);
  const cores = useMemo(() => coresSugeridas(form.modelo, aparelhos), [form.modelo, aparelhos]);
  const coresDaLoja = useMemo(() => coresSugeridas('', aparelhos, 60), [aparelhos]);
  const sugestaoPreco = useMemo(
    () =>
      form.modelo.trim()
        ? sugerirPreco({ modelo: form.modelo, capacidade: form.capacidade, condicao: form.condicao }, aparelhos)
        : null,
    [form.modelo, form.capacidade, form.condicao, aparelhos]
  );
  const custoConsiderado = podeVerFinanceiro ? form.custo : null;
  const margem = useMemo(
    () => calcularMargem(custoConsiderado, form.preco, MARGEM_MINIMA_PERCENTUAL),
    [custoConsiderado, form.preco]
  );
  const fornecedores = useMemo(() => {
    const nomes = new Set<string>();
    for (const a of aparelhos) {
      const achado = String(a.observacoes || '').match(/Fornecedor:\s*([^|\n]+)/);
      if (achado) nomes.add(achado[1].trim());
    }
    return [...nomes].slice(0, 50);
  }, [aparelhos]);
  const erros = useMemo(() => validarCadastroRapido(form), [form]);
  const errosVisiveis: Partial<Record<CampoCadastro, string>> = tentouSalvar ? erros : {};
  const erroIdentificador =
    errosVisiveis.identificador || (leitura.tipo === 'imei_invalido' && !form.identificadorEhSerial ? erros.identificador : undefined);

  const registroAnterior: { id: string; descricao: string; data: string } | null =
    duplicidade.tipo === 'fora_do_estoque'
      ? {
          id: duplicidade.aparelho.id,
          descricao: descreverAparelho(duplicidade.aparelho),
          data: dataCurta((duplicidade.aparelho as Aparelho & { data_saida?: string | null }).data_saida),
        }
      : existenteNoServidor
        ? { id: existenteNoServidor.id, descricao: existenteNoServidor.modelo || 'aparelho', data: '' }
        : null;

  const bloqueio =
    duplicidade.tipo === 'no_carrinho'
      ? 'Este aparelho já está no carrinho.'
      : duplicidade.tipo === 'manutencao'
        ? 'Este aparelho está em manutenção e não pode ser vendido agora.'
        : duplicidade.tipo === 'em_estoque'
          ? 'Este aparelho já está no estoque. Use o cadastro existente.'
          : registroAnterior && !recompraAceita
            ? 'Este aparelho já passou pela loja. Confirme que é uma recompra para cadastrar de novo.'
            : null;

  const temDados = Boolean(form.identificador.trim() || form.modelo.trim() || form.preco > 0 || form.custo !== null);

  // ── Preenchimento a partir do IMEI ──
  const comIdentificador = (
    base: FormCadastroRapido,
    texto: string,
    opcoes: { completar: boolean; podeSugerir: boolean; marcaEditada: boolean; anteriorPorTac: boolean }
  ) => {
    const lido = interpretarIdentificador(texto);
    const identificador = opcoes.completar && lido.tipo === 'imei' && lido.completado ? lido.imei : texto;
    let proximo: FormCadastroRapido = { ...base, identificador };
    let novaBaseTac: number | null = null;

    if (opcoes.podeSugerir) {
      const imeiLido = lido.tipo === 'imei' && (!lido.completado || opcoes.completar) ? lido.imei : null;
      const sugestao = imeiLido ? sugerirPorTac(imeiLido, aparelhos) : null;
      if (sugestao) {
        proximo = {
          ...proximo,
          modelo: sugestao.modelo,
          capacidade: sugestao.capacidade ?? capacidadeMaisComum(sugestao.modelo, aparelhos),
          marca: opcoes.marcaEditada ? proximo.marca : derivarMarca(sugestao.modelo, aparelhos).marca,
        };
        novaBaseTac = sugestao.base;
      } else if (opcoes.anteriorPorTac) {
        // O modelo tinha vindo do IMEI anterior e não vale para este.
        proximo = { ...proximo, modelo: '', capacidade: null };
      }
    }
    return { form: proximo, baseTac: novaBaseTac };
  };

  const alterarIdentificador = (texto: string, opcoes: { completar?: boolean } = {}) => {
    // Um IMEI completo e válido desfaz o "é serial": senão ele seria gravado como número de série.
    const lido = interpretarIdentificador(texto);
    const base =
      form.identificadorEhSerial && lido.tipo === 'imei' && !lido.completado ? { ...form, identificadorEhSerial: false } : form;
    const resultado = comIdentificador(base, texto, {
      completar: Boolean(opcoes.completar),
      podeSugerir: !form.modelo.trim() || baseTac !== null,
      marcaEditada,
      anteriorPorTac: baseTac !== null,
    });
    const antes = resolverIdentificadores(form);
    const depois = resolverIdentificadores(resultado.form);
    setForm(resultado.form);
    setBaseTac(resultado.baseTac);
    if (antes.imei !== depois.imei || antes.numeroSerie !== depois.numeroSerie) {
      setErroServidor(null);
      setExistenteNoServidor(null);
      setRecompraAceita(false);
    }
    return resultado.form;
  };

  // ── Foco e ordem dos campos ──
  const proximoCampo = (f: FormCadastroRapido, atual: Campo): Campo | 'salvar' => {
    const ordem: Campo[] = ['identificador', 'modelo', 'capacidade', 'condicao', 'bateria', 'cor', 'custo', 'preco'];
    const precisa = (campo: Campo) => {
      switch (campo) {
        case 'modelo':
          return !f.modelo.trim();
        case 'capacidade':
          return !f.capacidade;
        case 'bateria':
          return f.condicao !== 'novo' && !f.bateria.trim();
        case 'custo':
          return podeVerFinanceiro && f.custo === null;
        case 'preco':
          return true;
        default:
          return false;
      }
    };
    const inicio = ordem.indexOf(atual);
    for (const campo of ordem.slice(inicio + 1)) if (precisa(campo)) return campo;
    return 'salvar';
  };

  const focar = (campo: Campo) => {
    if (campo === 'marca') setEditandoMarca(true);
    if (campo === 'precoAtacado') setMaisDetalhes(true);
    const mapa: Record<Campo, { current: HTMLElement | null }> = {
      identificador: identificadorRef,
      modelo: modeloRef,
      marca: marcaRef,
      capacidade: capacidadeRef,
      condicao: condicaoRef,
      bateria: bateriaRef,
      cor: corRef,
      custo: custoRef,
      preco: precoRef,
      precoAtacado: precoAtacadoRef,
    };
    window.setTimeout(() => mapa[campo].current?.focus(), 0);
  };

  const avancar = (atual: Campo, f: FormCadastroRapido = form) => {
    const proximo = proximoCampo(f, atual);
    if (proximo === 'salvar') focar('preco');
    else focar(proximo);
  };

  // ── Abertura ──
  useEffect(() => {
    if (!aberto) return;
    let inicial = formularioVazio();
    let novaBaseTac: number | null = null;

    const modeloInicial = valoresIniciais?.modelo?.trim() || '';
    if (modeloInicial) {
      const modelo = normalizarModelo(modeloInicial) || modeloInicial;
      inicial = {
        ...inicial,
        modelo,
        marca: derivarMarca(modelo, aparelhos).marca,
        capacidade: capacidadeMaisComum(modelo, aparelhos),
      };
    } else {
      inicial = { ...inicial, marca: derivarMarca('', aparelhos).marca };
    }

    const identificadorInicial = valoresIniciais?.identificador?.trim() || '';
    if (identificadorInicial) {
      const resultado = comIdentificador(inicial, identificadorInicial, {
        completar: true,
        podeSugerir: !modeloInicial,
        marcaEditada: false,
        anteriorPorTac: false,
      });
      inicial = resultado.form;
      novaBaseTac = resultado.baseTac;
    }

    setForm(inicial);
    setBaseTac(novaBaseTac);
    setMarcaEditada(false);
    setEditandoMarca(false);
    setPrecoEditado(false);
    setTentouSalvar(false);
    setSalvando(null);
    setErroServidor(null);
    setConfirmacao(null);
    setExistenteNoServidor(null);
    setRecompraAceita(false);
    setBuscaAberta(false);
    setDestaque(0);
    setMaisDetalhes(lerLocal(CHAVE_DETALHES) === '1');
    setTemUltimo(Boolean(lerLocal(CHAVE_ULTIMO)));
    // Uma leitura de câmera anterior à abertura não pertence a este cadastro.
    ultimaLeituraRef.current = codigoEscaneado?.seq ?? null;

    const alvo = identificadorInicial || modeloInicial ? proximoCampo(inicial, identificadorInicial ? 'identificador' : 'modelo') : 'identificador';
    const timer = window.setTimeout(() => focar(alvo === 'salvar' ? 'preco' : alvo), 60);
    return () => window.clearTimeout(timer);
    // Só reinicia ao abrir: aparelhos e props mudam enquanto a pessoa digita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // ── Leitura pela câmera do PDV ──
  useEffect(() => {
    if (!aberto || !codigoEscaneado || ultimaLeituraRef.current === codigoEscaneado.seq) return;
    ultimaLeituraRef.current = codigoEscaneado.seq;
    const atualizado = alterarIdentificador(codigoEscaneado.valor, { completar: true });
    avancar('identificador', atualizado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, codigoEscaneado?.seq]);

  // ── Ações ──
  const aceitarModelo = (texto: string): FormCadastroRapido => {
    const modelo = normalizarModelo(texto) || texto.trim();
    if (!modelo) return form;
    const doModelo = capacidadesDoModelo(modelo);
    const proximo: FormCadastroRapido = {
      ...form,
      modelo,
      marca: marcaEditada ? form.marca : derivarMarca(modelo, aparelhos).marca || form.marca,
      capacidade:
        form.capacidade && doModelo.includes(form.capacidade) ? form.capacidade : capacidadeMaisComum(modelo, aparelhos),
    };
    setForm(proximo);
    setBuscaAberta(false);
    return proximo;
  };

  const aplicarSugestaoPreco = () => {
    if (!sugestaoPreco) return;
    setForm((f) => ({ ...f, preco: sugestaoPreco.valor }));
    setPrecoEditado(true);
  };

  const repetirUltimo = () => {
    const bruto = lerLocal(CHAVE_ULTIMO);
    if (!bruto) return;
    try {
      const ultimo = JSON.parse(bruto) as UltimoCadastro;
      setForm((f) => ({
        ...f,
        identificador: '',
        semImei: false,
        identificadorEhSerial: false,
        numeroSerie: '',
        bateria: '',
        modelo: ultimo.modelo || f.modelo,
        marca: ultimo.marca || f.marca,
        capacidade: ultimo.capacidade ?? f.capacidade,
        condicao: ultimo.condicao || f.condicao,
        cor: ultimo.cor || '',
        custo: podeVerFinanceiro && typeof ultimo.custo === 'number' ? ultimo.custo : f.custo,
        preco: typeof ultimo.preco === 'number' ? ultimo.preco : f.preco,
      }));
      setPrecoEditado(true);
      // A marca copiada ainda segue o modelo: trocar o modelo deriva a marca de novo.
      setMarcaEditada(false);
      setBaseTac(null);
      setRecompraAceita(false);
      setExistenteNoServidor(null);
      setErroServidor(null);
      focar('identificador');
      toast.message('Dados do último cadastro copiados. Bipe o próximo IMEI.');
    } catch {
      // Registro local corrompido: ignora.
    }
  };

  const pedirFechar = () => {
    if (salvando) return;
    if (temDados && confirmacao !== 'descartar') {
      setConfirmacao('descartar');
      return;
    }
    onFechar();
  };

  const salvar = async (modo: ModoConclusao, opcoes: { aceitarPrejuizo?: boolean } = {}) => {
    if (salvando) return;
    setTentouSalvar(true);
    setErroServidor(null);

    let atual = form;
    if (leitura.tipo === 'imei' && leitura.completado && !form.identificadorEhSerial) {
      atual = { ...form, identificador: leitura.imei };
      setForm(atual);
    }

    const errosAgora = validarCadastroRapido(atual);
    const primeiroErro = (Object.keys(errosAgora) as CampoCadastro[])[0];
    if (primeiroErro) {
      focar(primeiroErro);
      return;
    }
    if (bloqueio) {
      focar('identificador');
      return;
    }
    if (margem?.prejuizo && !opcoes.aceitarPrejuizo) {
      setModoPendente(modo);
      setConfirmacao('prejuizo');
      return;
    }
    const lojaId = usuario?.lojaId;
    if (!lojaId) {
      setErroServidor('Não identifiquei a sua loja. Entre de novo e tente outra vez.');
      return;
    }

    setConfirmacao(null);
    setSalvando(modo);
    try {
      const payload = montarPayloadCadastroRapido(atual, {
        usuarioNome: usuario?.nome,
        podeVerFinanceiro,
        codigo: gerarCodigoEtiqueta(aparelhos),
        margemAtacado: MARGEM_ATACADO_PADRAO,
        coresConhecidas: coresDaLoja,
        recompraDe: recompraAceita && registroAnterior ? { id: registroAnterior.id } : null,
      });

      const resultado = await cadastrarAparelhoRapido(
        supabase,
        payload,
        {
          lojaId,
          usuarioId: usuario?.id ?? null,
          usuarioNome: usuario?.nome ?? null,
          usuarioEmail: usuario?.email ?? null,
          criarAparelho,
          registrarLog,
        },
        { aceitarRecompra: recompraAceita }
      );

      const ultimo: UltimoCadastro = {
        modelo: payload.modelo,
        marca: payload.marca,
        capacidade: payload.capacidade,
        condicao: payload.condicao,
        cor: payload.cor,
        custo: podeVerFinanceiro ? atual.custo : null,
        preco: payload.preco,
      };
      gravarLocal(CHAVE_ULTIMO, JSON.stringify(ultimo));

      if (!resultado.auditoriaRegistrada) {
        toast.warning('Aparelho cadastrado, mas a entrada no estoque não foi gravada inteira na auditoria. Avise o suporte.', {
          description: resultado.erroAuditoria,
        });
      }
      onConcluido(resultado.aparelho, modo);
    } catch (erro) {
      if (erro instanceof ErroCadastroRapido) {
        if (erro.codigo === 'duplicado_fora_do_estoque' && erro.existente) {
          setExistenteNoServidor(erro.existente);
          setRecompraAceita(false);
        }
        setErroServidor(erro.message);
      } else {
        setErroServidor(erro instanceof Error ? erro.message : 'Não foi possível cadastrar o aparelho.');
      }
    } finally {
      setSalvando(null);
    }
  };

  // ── Teclado do popup inteiro ──
  // Parar a propagação aqui impede que o Esc/Enter chegue aos atalhos do PDV,
  // que fechavam a venda (Esc) ou a finalizavam (Enter) com o popup aberto.
  const aoTeclar = (e: TeclaReact<HTMLDivElement>) => {
    if (scannerAberto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (buscaAberta) return setBuscaAberta(false);
      if (confirmacao === 'descartar') return onFechar();
      if (confirmacao) return setConfirmacao(null);
      return pedirFechar();
    }
    if (e.key === 'Enter') {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        void salvar('adicionar');
      } else if (e.shiftKey) {
        e.preventDefault();
        void salvar('cadastrar');
      }
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      e.stopPropagation();
      onAbrirScanner?.();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      e.stopPropagation();
      repetirUltimo();
      return;
    }
    if (e.key === 'Tab' && painelRef.current) {
      const focaveis = Array.from(
        painelRef.current.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]'
        )
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  };

  const enterSimples = (e: TeclaReact<HTMLElement>) => e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey;

  if (!aberto) return null;

  return (
    <ModalPortal>
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cadastro-rapido"
        className="modal-overlay modal-overlay-fit z-[70]"
        onKeyDown={aoTeclar}
      >
        <GlassCard className="modal-panel modal-panel-fit modal-panel-lg w-full my-4">
          <div className="modal-header">
            <div>
              <h3 id="titulo-cadastro-rapido" className="modal-title flex items-center gap-2">
                <PackagePlus className="h-5 w-5 text-blue-400" /> Cadastrar aparelho
              </h3>
              <p className="modal-subtitle">Bipe o IMEI, confira modelo e preço e adicione à venda.</p>
            </div>
            <div className="flex items-center gap-1">
              {temUltimo && (
                <Button type="button" variant="ghost" className="h-9 gap-1.5 px-2 text-xs" onClick={repetirUltimo} title="Ctrl+D">
                  <Repeat className="h-4 w-4" /> <span className="hidden sm:inline">Repetir último</span>
                </Button>
              )}
              <Button type="button" variant="ghost" size="icon" onClick={pedirFechar} aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="modal-body-scroll space-y-4">
            {/* IMEI / série */}
            <div>
              <Rotulo
                extra={
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={form.semImei}
                      disabled={Boolean(bloqueio) && !form.semImei}
                      onChange={(e) => {
                        const marcado = e.target.checked;
                        // O que estava no campo sai junto: senão a checagem de duplicidade
                        // desligaria e um aparelho que já está no estoque entraria de novo.
                        setForm((f) => ({
                          ...f,
                          semImei: marcado,
                          identificador: marcado ? '' : f.identificador,
                          identificadorEhSerial: marcado ? false : f.identificadorEhSerial,
                        }));
                        if (marcado) {
                          setBaseTac(null);
                          setExistenteNoServidor(null);
                          setRecompraAceita(false);
                          setErroServidor(null);
                          focar(form.modelo.trim() ? 'preco' : 'modelo');
                        }
                      }}
                    />
                    Sem IMEI agora
                  </label>
                }
              >
                IMEI ou nº de série
              </Rotulo>
              <div className="flex gap-2">
                <input
                  ref={identificadorRef}
                  value={form.identificador}
                  disabled={form.semImei}
                  onChange={(e) => alterarIdentificador(e.target.value)}
                  onBlur={() => {
                    if (leitura.tipo === 'imei' && leitura.completado && !form.identificadorEhSerial) {
                      alterarIdentificador(form.identificador, { completar: true });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!enterSimples(e)) return;
                    e.preventDefault();
                    const atualizado = alterarIdentificador(form.identificador, { completar: true });
                    avancar('identificador', atualizado);
                  }}
                  inputMode={form.identificadorEhSerial ? 'text' : 'numeric'}
                  enterKeyHint="next"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={60}
                  placeholder={form.semImei ? 'Sem IMEI' : 'IMEI (15 dígitos) ou nº de série'}
                  aria-invalid={Boolean(erroIdentificador)}
                  className={cn(
                    'input-glass h-12 font-mono text-lg tracking-wider',
                    erroIdentificador && 'border-rose-500/60'
                  )}
                />
                {onAbrirScanner && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-12 shrink-0 p-0"
                    onClick={onAbrirScanner}
                    title="Ler com a câmera (F2)"
                    aria-label="Ler com a câmera"
                  >
                    <Camera className="h-5 w-5" />
                  </Button>
                )}
              </div>

              <div className="ml-1 mt-1.5 min-h-[1.25rem] text-xs">
                {form.semImei ? (
                  <span className="text-amber-300">O cadastro fica marcado como IMEI pendente.</span>
                ) : form.identificadorEhSerial ? (
                  <span className="text-sky-300">
                    Gravando como nº de série/código.{' '}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setForm((f) => ({ ...f, identificadorEhSerial: false }))}
                    >
                      É IMEI
                    </button>
                  </span>
                ) : leitura.tipo === 'vazio' ? (
                  <span className="text-muted-foreground">Bipe com o leitor ou use a câmera. Enter avança.</span>
                ) : leitura.tipo === 'incompleto' ? (
                  <span className="text-muted-foreground">{leitura.digitos.length} de 15 dígitos</span>
                ) : leitura.tipo === 'imei' && leitura.completado ? (
                  <span className="text-sky-300">Faltou o último dígito: Enter completa com {leitura.imei.slice(-1)}.</span>
                ) : leitura.tipo === 'imei' ? (
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> IMEI válido
                    </span>
                    {baseTac !== null && (
                      <span className="inline-flex items-center gap-1 text-violet-300">
                        <Sparkles className="h-3 w-3" /> modelo sugerido pelo IMEI ({baseTac}{' '}
                        {baseTac === 1 ? 'aparelho' : 'aparelhos'} da loja)
                      </span>
                    )}
                  </span>
                ) : leitura.tipo === 'imei_invalido' ? (
                  <span className="text-rose-400">
                    Dígito verificador não confere.{' '}
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => setForm((f) => ({ ...f, identificadorEhSerial: true }))}
                    >
                      Não é IMEI, é serial/código
                    </button>
                  </span>
                ) : (
                  <span className="text-sky-300">Nº de série {leitura.numeroSerie}</span>
                )}
              </div>
              {tentouSalvar && leitura.tipo !== 'imei_invalido' && <ErroCampo mensagem={errosVisiveis.identificador} />}

              {duplicidade.tipo === 'em_estoque' && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-amber-200">Já está no estoque</p>
                    <p className="truncate text-xs text-amber-100/80">
                      {descreverAparelho(duplicidade.aparelho)} · {dinheiro(duplicidade.aparelho.preco || 0)}
                      {formatarSaudeBateria(duplicidade.aparelho) ? ` · ${formatarSaudeBateria(duplicidade.aparelho)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="h-10 bg-amber-500 text-slate-950 hover:bg-amber-400"
                    onClick={() => onUsarExistente(duplicidade.aparelho)}
                  >
                    Usar este
                  </Button>
                </div>
              )}
              {duplicidade.tipo === 'no_carrinho' && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {descreverAparelho(duplicidade.aparelho)} já está no carrinho.
                </div>
              )}
              {duplicidade.tipo === 'manutencao' && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                  <Wrench className="h-4 w-4 shrink-0" /> {descreverAparelho(duplicidade.aparelho)} está em manutenção e não pode
                  ser vendido agora.
                </div>
              )}
              {registroAnterior && (
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-400/30 bg-slate-500/10 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded"
                    checked={recompraAceita}
                    onChange={(e) => setRecompraAceita(e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">Este aparelho já passou pela loja</span>
                    <span className="block text-xs text-muted-foreground">
                      {registroAnterior.descricao}
                      {registroAnterior.data ? ` · saiu em ${registroAnterior.data}` : ''}. Marque se é uma recompra: ele entra de
                      novo como um cadastro novo, e o histórico anterior fica como está.
                    </span>
                  </span>
                </label>
              )}
            </div>

            {/* Modelo */}
            <div>
              <Rotulo
                extra={
                  editandoMarca ? (
                    <input
                      ref={marcaRef}
                      value={form.marca}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, marca: e.target.value }));
                        setMarcaEditada(true);
                      }}
                      onBlur={() => setEditandoMarca(false)}
                      onKeyDown={(e) => {
                        if (!enterSimples(e)) return;
                        e.preventDefault();
                        setEditandoMarca(false);
                        focar('modelo');
                      }}
                      placeholder="Marca"
                      className="input-glass h-7 w-32 px-2 py-0 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => focar('marca')}
                      className={cn(
                        'rounded-lg border px-2 py-0.5 text-[11px] font-semibold',
                        errosVisiveis.marca
                          ? 'border-rose-500/50 text-rose-300'
                          : 'border-slate-400/30 text-muted-foreground hover:text-foreground'
                      )}
                      title="Alterar marca"
                    >
                      Marca: {form.marca || 'informar'}
                    </button>
                  )
                }
              >
                Modelo *
              </Rotulo>
              <div className="relative">
                <input
                  ref={modeloRef}
                  value={form.modelo}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, modelo: e.target.value }));
                    setBaseTac(null);
                    setBuscaAberta(true);
                    setDestaque(0);
                  }}
                  onFocus={() => setBuscaAberta(true)}
                  onBlur={() => {
                    setBuscaAberta(false);
                    if (form.modelo.trim()) aceitarModelo(form.modelo);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setBuscaAberta(true);
                      setDestaque((i) => Math.min(i + 1, Math.max(sugestoesModelo.length - 1, 0)));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setDestaque((i) => Math.max(i - 1, 0));
                      return;
                    }
                    const escolhido =
                      buscaAberta && form.modelo.trim() && sugestoesModelo[destaque]
                        ? sugestoesModelo[destaque].modelo
                        : form.modelo;
                    if (e.key === 'Tab' && !e.shiftKey && escolhido.trim()) {
                      aceitarModelo(escolhido);
                      return;
                    }
                    if (enterSimples(e)) {
                      e.preventDefault();
                      if (!escolhido.trim()) return;
                      avancar('modelo', aceitarModelo(escolhido));
                    }
                  }}
                  role="combobox"
                  aria-expanded={buscaAberta}
                  aria-controls="pdv-cadastro-modelos"
                  aria-autocomplete="list"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder="Ex.: 13 pro max, 15pm, Galaxy S23"
                  className={cn('input-glass h-11', errosVisiveis.modelo && 'border-rose-500/60')}
                />
                {buscaAberta && sugestoesModelo.length > 0 && (
                  <ul
                    id="pdv-cadastro-modelos"
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur"
                  >
                    {sugestoesModelo.map((opcao, i) => (
                      <li
                        key={opcao.chave}
                        role="option"
                        aria-selected={i === destaque}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setDestaque(i)}
                        onClick={() => avancar('modelo', aceitarModelo(opcao.modelo))}
                        className={cn(
                          'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-100',
                          i === destaque ? 'bg-blue-600/80' : 'hover:bg-white/10'
                        )}
                      >
                        <span>{opcao.modelo}</span>
                        {opcao.usoNaLoja > 0 && <span className="text-[11px] text-slate-300/80">já vendido na loja</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <ErroCampo mensagem={errosVisiveis.modelo || errosVisiveis.marca} />
            </div>

            {/* Capacidade */}
            <div>
              <Rotulo>Capacidade *</Rotulo>
              <div
                ref={capacidadeRef}
                role="radiogroup"
                aria-label="Capacidade"
                tabIndex={0}
                onKeyDown={(e) => {
                  const numero = Number(e.key);
                  if (Number.isInteger(numero) && numero >= 1 && numero <= capacidades.length) {
                    e.preventDefault();
                    setForm((f) => ({ ...f, capacidade: capacidades[numero - 1] }));
                    return;
                  }
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const indice = capacidades.indexOf(form.capacidade || '');
                    const proximo =
                      e.key === 'ArrowRight' ? Math.min(indice + 1, capacidades.length - 1) : Math.max(indice - 1, 0);
                    setForm((f) => ({ ...f, capacidade: capacidades[proximo] }));
                    return;
                  }
                  if (enterSimples(e)) {
                    e.preventDefault();
                    avancar('capacidade');
                  }
                }}
                className="flex flex-wrap gap-2 rounded-xl p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                {capacidades.map((cap, i) => (
                  <Chip
                    key={cap}
                    ativo={form.capacidade === cap}
                    titulo={i < 9 ? `Tecla ${i + 1}` : undefined}
                    onClick={() => setForm((f) => ({ ...f, capacidade: f.capacidade === cap ? null : cap }))}
                  >
                    {cap}
                  </Chip>
                ))}
              </div>
              <ErroCampo mensagem={errosVisiveis.capacidade} />
            </div>

            {/* Condição e bateria */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Rotulo>Condição *</Rotulo>
                <div
                  ref={condicaoRef}
                  role="radiogroup"
                  aria-label="Condição"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const porAtalho = CONDICOES_RAPIDAS.find((c) => c.atalho === e.key.toLowerCase());
                    if (porAtalho && !e.ctrlKey && !e.metaKey && !e.altKey) {
                      e.preventDefault();
                      setForm((f) => ({ ...f, condicao: porAtalho.valor }));
                      return;
                    }
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const indice = CONDICOES_RAPIDAS.findIndex((c) => c.valor === form.condicao);
                      const proximo =
                        e.key === 'ArrowRight'
                          ? Math.min(indice + 1, CONDICOES_RAPIDAS.length - 1)
                          : Math.max(indice - 1, 0);
                      setForm((f) => ({ ...f, condicao: CONDICOES_RAPIDAS[proximo].valor }));
                      return;
                    }
                    if (enterSimples(e)) {
                      e.preventDefault();
                      avancar('condicao');
                    }
                  }}
                  className="flex flex-wrap gap-2 rounded-xl p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                >
                  {CONDICOES_RAPIDAS.map((c) => (
                    <Chip
                      key={c.valor}
                      ativo={form.condicao === c.valor}
                      titulo={`Tecla ${c.atalho.toUpperCase()}`}
                      onClick={() => setForm((f) => ({ ...f, condicao: c.valor }))}
                    >
                      {c.rotulo}
                    </Chip>
                  ))}
                </div>
              </div>

              {form.condicao !== 'novo' && (
                <div>
                  <Rotulo>Bateria %</Rotulo>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={bateriaRef}
                      value={form.bateria}
                      onChange={(e) => setForm((f) => ({ ...f, bateria: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                      onKeyDown={(e) => {
                        if (!enterSimples(e)) return;
                        e.preventDefault();
                        avancar('bateria');
                      }}
                      inputMode="numeric"
                      enterKeyHint="next"
                      placeholder="87"
                      aria-invalid={Boolean(errosVisiveis.bateria)}
                      className={cn('input-glass h-10 w-20 text-center', errosVisiveis.bateria && 'border-rose-500/60')}
                    />
                    {CHIPS_BATERIA.map((valor) => (
                      <Chip
                        key={valor}
                        ativo={form.bateria === String(valor)}
                        onClick={() => setForm((f) => ({ ...f, bateria: String(valor) }))}
                      >
                        {valor}
                      </Chip>
                    ))}
                  </div>
                  <ErroCampo mensagem={errosVisiveis.bateria} />
                </div>
              )}
            </div>

            {/* Cor */}
            <div>
              <Rotulo>
                Cor <span className="font-normal normal-case">(opcional)</span>
              </Rotulo>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={corRef}
                  value={form.cor}
                  onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                  onKeyDown={(e) => {
                    if (!enterSimples(e)) return;
                    e.preventDefault();
                    avancar('cor');
                  }}
                  enterKeyHint="next"
                  autoComplete="off"
                  placeholder="Cor"
                  className="input-glass h-10 w-40"
                />
                {cores.map((cor) => (
                  <Chip
                    key={cor}
                    ativo={form.cor.trim().toLowerCase() === cor.toLowerCase()}
                    onClick={() => setForm((f) => ({ ...f, cor: f.cor.trim().toLowerCase() === cor.toLowerCase() ? '' : cor }))}
                  >
                    {cor}
                  </Chip>
                ))}
              </div>
            </div>

            {/* Valores */}
            <div className={cn('grid gap-4', podeVerFinanceiro && 'sm:grid-cols-2')}>
              {podeVerFinanceiro && (
                <div>
                  <Rotulo>Custo (R$)</Rotulo>
                  <input
                    ref={custoRef}
                    value={mascaraDinheiro(form.custo)}
                    onChange={(e) => {
                      const custo = lerDinheiro(e.target.value);
                      setForm((f) => ({
                        ...f,
                        custo,
                        // Preço automático só enquanto a pessoa não digitou um preço.
                        preco:
                          !precoEditado && custo !== null
                            ? Math.round((custo + MARGEM_VAREJO_PADRAO) * 100) / 100
                            : f.preco,
                      }));
                    }}
                    onKeyDown={(e) => {
                      if (!enterSimples(e)) return;
                      e.preventDefault();
                      avancar('custo');
                    }}
                    inputMode="numeric"
                    enterKeyHint="next"
                    placeholder="0,00"
                    className="input-glass h-11 text-right font-semibold"
                  />
                  {form.custo === null && form.preco > 0 && (
                    <p className="ml-1 mt-1 text-xs text-amber-300">Sem custo, o lucro desta venda fica errado.</p>
                  )}
                  <ErroCampo mensagem={errosVisiveis.custo} />
                </div>
              )}

              <div>
                <Rotulo
                  extra={
                    sugestaoPreco ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={aplicarSugestaoPreco}
                        className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20"
                      >
                        Sugerido {dinheiro(sugestaoPreco.valor)}
                      </button>
                    ) : null
                  }
                >
                  Preço de venda *
                </Rotulo>
                <input
                  ref={precoRef}
                  value={form.preco > 0 ? mascaraDinheiro(form.preco) : ''}
                  onChange={(e) => {
                    const preco = lerDinheiro(e.target.value) ?? 0;
                    setForm((f) => ({ ...f, preco }));
                    setPrecoEditado(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey && !(form.preco > 0) && sugestaoPreco) {
                      aplicarSugestaoPreco();
                      return;
                    }
                    if (!enterSimples(e)) return;
                    e.preventDefault();
                    if (!(form.preco > 0) && sugestaoPreco) {
                      aplicarSugestaoPreco();
                      return;
                    }
                    void salvar('adicionar');
                  }}
                  inputMode="numeric"
                  enterKeyHint="done"
                  placeholder="0,00"
                  aria-invalid={Boolean(errosVisiveis.preco)}
                  className={cn('input-glass h-11 text-right text-lg font-bold', errosVisiveis.preco && 'border-rose-500/60')}
                />
                {sugestaoPreco && (
                  <p className="ml-1 mt-1 text-[11px] text-muted-foreground">
                    Base: {sugestaoPreco.base} {sugestaoPreco.base === 1 ? 'aparelho igual' : 'aparelhos iguais'}
                    {sugestaoPreco.base > 1 ? `, de ${dinheiro(sugestaoPreco.minimo)} a ${dinheiro(sugestaoPreco.maximo)}` : ''}
                    {sugestaoPreco.criterio === 'sem_condicao' ? ' (de outra condição)' : ''}
                  </p>
                )}
                <ErroCampo mensagem={errosVisiveis.preco} />
              </div>
            </div>

            {podeVerFinanceiro && margem && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-sm',
                  margem.prejuizo
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : margem.abaixoDoMinimo
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                )}
              >
                <span className="font-semibold">
                  {margem.prejuizo ? 'Prejuízo' : 'Lucro'} {dinheiro(Math.abs(margem.lucro))}
                </span>
                <span>Margem {margem.percentual.toLocaleString('pt-BR')}%</span>
                {sugestaoPreco && form.preco > 0 && (
                  <span className="text-xs opacity-80">
                    {form.preco >= sugestaoPreco.valor ? '+' : '−'}
                    {dinheiro(Math.abs(form.preco - sugestaoPreco.valor))} vs. sugerido
                  </span>
                )}
              </div>
            )}

            {/* Mais detalhes */}
            <div className="rounded-xl border border-slate-400/20">
              <button
                type="button"
                onClick={() => {
                  const valor = !maisDetalhes;
                  setMaisDetalhes(valor);
                  gravarLocal(CHAVE_DETALHES, valor ? '1' : '0');
                }}
                className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                <span>Mais detalhes: atacado, série, fornecedor, acessórios</span>
                {maisDetalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {maisDetalhes && (
                <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
                  <div>
                    <Rotulo>Preço atacado (R$)</Rotulo>
                    <input
                      ref={precoAtacadoRef}
                      value={mascaraDinheiro(form.precoAtacado)}
                      onChange={(e) => setForm((f) => ({ ...f, precoAtacado: lerDinheiro(e.target.value) }))}
                      inputMode="numeric"
                      placeholder={
                        podeVerFinanceiro && form.custo
                          ? `Padrão ${mascaraDinheiro(form.custo + MARGEM_ATACADO_PADRAO)}`
                          : '0,00'
                      }
                      className="input-glass h-10 text-right"
                    />
                  </div>
                  <div>
                    <Rotulo>Nº de série</Rotulo>
                    <input
                      value={leitura.tipo === 'serial' && !form.semImei ? leitura.numeroSerie : form.numeroSerie}
                      disabled={leitura.tipo === 'serial' && !form.semImei}
                      onChange={(e) => setForm((f) => ({ ...f, numeroSerie: e.target.value }))}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Opcional"
                      className="input-glass h-10 font-mono uppercase"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Rotulo>Fornecedor / origem</Rotulo>
                    <input
                      value={form.fornecedor}
                      onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))}
                      list="pdv-cadastro-fornecedores"
                      autoComplete="off"
                      placeholder="De quem o aparelho foi comprado"
                      className="input-glass h-10"
                    />
                    <datalist id="pdv-cadastro-fornecedores">
                      {fornecedores.map((nome) => (
                        <option key={nome} value={nome} />
                      ))}
                    </datalist>
                  </div>
                  <div className="sm:col-span-2">
                    <Rotulo>Acessórios inclusos</Rotulo>
                    <div className="flex flex-wrap gap-2">
                      {ACESSORIOS_RAPIDOS.map((item) => (
                        <Chip
                          key={item}
                          ativo={form.acessorios.includes(item)}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              acessorios: f.acessorios.includes(item)
                                ? f.acessorios.filter((x) => x !== item)
                                : [...f.acessorios, item],
                            }))
                          }
                        >
                          {item}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Rotulo>Observações</Rotulo>
                    <textarea
                      value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={2}
                      className="input-glass min-h-[4rem] resize-y"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rodapé */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            {erroServidor && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erroServidor}</span>
              </div>
            )}
            {bloqueio && !erroServidor && tentouSalvar && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">{bloqueio}</div>
            )}
            {confirmacao === 'prejuizo' && margem && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                <span className="flex-1">Vender com prejuízo de {dinheiro(Math.abs(margem.lucro))}?</span>
                <Button type="button" variant="outline" className="h-10" onClick={() => { setConfirmacao(null); focar('preco'); }}>
                  Revisar preço
                </Button>
                <Button
                  type="button"
                  className="h-10 bg-rose-600 text-white hover:bg-rose-700"
                  onClick={() => void salvar(modoPendente, { aceitarPrejuizo: true })}
                >
                  Confirmar
                </Button>
              </div>
            )}
            {confirmacao === 'descartar' && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-400/30 bg-slate-500/10 p-3 text-sm">
                <span className="flex-1">Descartar o que foi digitado?</span>
                <Button type="button" variant="outline" className="h-10" onClick={() => setConfirmacao(null)}>
                  Continuar editando
                </Button>
                <Button type="button" className="h-10 bg-rose-600 text-white hover:bg-rose-700" onClick={onFechar}>
                  Descartar
                </Button>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <p className="hidden text-[11px] text-muted-foreground lg:block lg:flex-1">
                Enter avança · Ctrl+Enter adiciona · Shift+Enter só cadastra · F2 câmera · Esc fecha
              </p>
              <Button type="button" variant="outline" className="h-11" onClick={pedirFechar} disabled={Boolean(salvando)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={() => void salvar('cadastrar')}
                disabled={Boolean(salvando) || Boolean(bloqueio)}
                title="Shift+Enter: cadastra no estoque sem pôr no carrinho"
              >
                {salvando === 'cadastrar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                Só cadastrar
              </Button>
              <Button
                type="button"
                className="h-11 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => void salvar('adicionar')}
                disabled={Boolean(salvando) || Boolean(bloqueio)}
                title="Ctrl+Enter"
              >
                {salvando === 'adicionar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Adicionar à venda
              </Button>
            </div>
          </div>
        </GlassCard>
      </div>
    </ModalPortal>
  );
}
