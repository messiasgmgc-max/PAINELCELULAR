# Correção: baixa em massa acidental do estoque (Phone Center / PAINELCELULAR)

## Contexto do incidente (real, 10/09/2026 09:16:38 BRT)

Um único `PATCH /rest/v1/aparelhos?id=in.(...)` marcou **112 aparelhos**
(R$ 43.000) com `ativo=false, condicao='vendido'`. Ninguém confirmou nada,
ninguém apagou nada. O estoque simplesmente sumiu da tela.

A origem é `handleRemontarEstoqueMercadoPhone`, em
`src/components/AparelhosTab.tsx`. Ela dá baixa em **tudo que estava ativo e
não deu match** no texto colado da lista MercadoPhone. Naquele dia só 1 item
deu match; os outros 112 foram baixados.

Corrija os problemas abaixo. Não refatore o resto do arquivo.

---

## 1. `handleRemontarEstoqueMercadoPhone` — baixa em massa sem freio

Arquivo: `src/components/AparelhosTab.tsx` (~linha 767)

O trecho final é:

```ts
const aparelhosParaDarBaixa = ativosAtuais.filter(a => !ativosMantidosIds.has(a.id));
if (aparelhosParaDarBaixa.length > 0) {
  const idsBaixa = aparelhosParaDarBaixa.map(a => a.id);
  await supabase.from('aparelhos')
    .update({ ativo: false, condicao: 'vendido' })
    .in('id', idsBaixa);
}
```

Exigências:

- **Trava de sanidade.** Se `aparelhosParaDarBaixa.length` for maior que
  `itensImportados.length` (ou passar de ~30% do estoque ativo), **aborte** a
  baixa, mantenha os matches já aplicados e mostre um erro explicando que a
  lista colada parece incompleta. Uma lista com 3 itens nunca deve poder
  zerar um estoque de 112.
- **Confirmação explícita e quantificada** antes de qualquer baixa:
  `"X aparelhos serão marcados como VENDIDOS e sairão do estoque. Y foram
  encontrados na lista. Confirma?"` — com a contagem real, não texto genérico.
- **Não use `condicao: 'vendido'` para baixa.** Isso destrói a informação de
  condição (novo/lacrado/seminovo) e é irreversível. Use um campo próprio de
  baixa (ex.: `status='baixado'` + `data_baixa`), preservando `condicao`.
- **Registre em `logs_sistema`** (`tipo_evento='estoque'`,
  `acao='Baixa em massa (Remontar MercadoPhone)'`) com `valor_anterior` e
  `valor_novo` preenchidos e a contagem de afetados. Hoje esse log não existe
  — foi por isso que a tabela `logs_sistema` só mostrava logins.

## 2. `handleRestaurarEstoqueDesativado` — restaura demais

Arquivo: `src/components/AparelhosTab.tsx` (~linha 741)

```ts
let query = supabase.from('aparelhos').update({ ativo: true, condicao: 'seminovo' });
if (usuario?.lojaId) {
  query = query.eq('loja_id', usuario.lojaId);   // ← nenhum outro filtro
}
```

Isso reativa **todos** os aparelhos da loja, inclusive os realmente vendidos,
e ainda sobrescreve a condição de todos para `'seminovo'`. É mais destrutivo
que o bug que pretende consertar.

Exigências:
- Filtrar por `status != 'vendido'` (nunca ressuscitar venda concluída).
- Nunca sobrescrever `condicao` em massa — restaurar apenas `ativo`.
- Mostrar quantos serão restaurados antes de confirmar.

## 3. `handleDeleteEstoque` — hard delete em massa

Arquivo: `src/components/AparelhosTab.tsx` (~linha 1179)

```ts
.delete().eq('loja_id', currentLojaId).neq('ativo', false)
```

`DELETE` físico protegido só por um `confirm()`. Troque por soft delete
(`ativo=false` + `data_baixa` + log em `logs_sistema`). Se o hard delete for
mesmo necessário, exija digitar o nome da loja para confirmar.

## 4. `status` vs `condicao` — duas fontes de verdade

A tabela `aparelhos` tem `status` ('disponivel'/'vendido') **e** `condicao`
('seminovo'/'novo'/'vendido'). Partes do código escrevem em um, partes no
outro. Foi exatamente essa inconsistência que permitiu recuperar o estoque
(os 112 tinham `condicao='vendido'` mas `status='disponivel'`) — mas é um bug
esperando para acontecer de novo.

Padronize: `status` é o ciclo de vida (disponivel / vendido / baixado /
manutencao); `condicao` é o estado físico (novo / lacrado / seminovo) e
**nunca** recebe 'vendido'. Escreva a migration e ajuste todas as escritas.

## 5. Backup só existe no localStorage

`salvarSnapshotBackup` (`src/components/BackupEstoqueModal.tsx`) grava em
`localStorage` com chave `painel_celular_pontos_backup_estoque`, mantendo 10
pontos. Isso não existe em outro dispositivo e some ao limpar o cache — ou
seja, o backup falha justamente quando mais se precisa dele.

Persista os snapshots numa tabela `backups_estoque` no Supabase
(`loja_id`, `motivo`, `criado_em`, `payload jsonb`), mantendo o localStorage
apenas como cache local.

## 6. Segurança: `whatsapp_logs` sem RLS

A tabela `public.whatsapp_logs` está com Row Level Security **desabilitada** —
qualquer um com a chave anon lê e escreve todas as 622 linhas. Habilite RLS e
crie a policy de isolamento por loja, no mesmo padrão das outras tabelas:

```sql
alter table public.whatsapp_logs enable row level security;
-- + policy de isolamento por loja (espelhar "Isolamento por Loja" de aparelhos)
```

Atenção: habilitar RLS sem policy bloqueia todo o acesso. Crie a policy na
mesma migration.

---

## Entrega esperada

1. Migration SQL para os itens 4, 5 e 6.
2. Patch em `AparelhosTab.tsx` para os itens 1, 2 e 3.
3. Testes cobrindo o caso do incidente: lista com 3 itens contra estoque de
   112 ativos **deve abortar**, não baixar 109.
