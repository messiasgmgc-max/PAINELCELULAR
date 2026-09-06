# Catálogo de Frases de Teste & Checklist de Regressão (Phone Center Bot)

Este documento registra as frases reais enviadas por lojistas e clientes no WhatsApp, mapeando a ação operacional esperada, os parâmetros e o nível de confiança exigido no funil do Gemini AI.

> **Regra Obrigatória:** Antes de qualquer alteração em `commandExecutor.ts`, nos prompts do Gemini ou na camada de webhook, execute a suíte de testes automatizados (`npx tsx --test src/app/api/webhook/evolution/commandExecutor.test.ts`) para garantir que nenhuma frase deste catálogo regrida para silêncio ou execução incorreta.

---

## 1. Vendas e Baixas de Estoque (`create_venda`)

| Frase do Lojista | Ação Esperada | Nível de Confiança | Parâmetros Extraídos | Comportamento Esperado |
| :--- | :--- | :--- | :--- | :--- |
| `"vendi o 13 pro pro Lucas por 2500"` | `create_venda` | **Alta** | `modelo: "iPhone 13 Pro", comprador: "Lucas", valor: 2500` | Executa/confirma venda formatada no WhatsApp |
| `"venda realizada iphone 14 128gb valor 3200 cliente Marcos"` | `create_venda` | **Alta** | `modelo: "iPhone 14 128gb", comprador: "Marcos", valor: 3200` | Executa/confirma venda formatada no WhatsApp |
| `"vende esse aí pro Lucas"` | `create_venda` | **Média** | `comprador: "Lucas"` | Retorna pergunta de clarificação: *"Qual é o modelo do aparelho e o valor da venda para o Lucas?"* |
| `"dei baixa no 11 por 1500"` | `create_venda` | **Alta** | `modelo: "iPhone 11", valor: 1500` | Executa/confirma venda formatada no WhatsApp |
| `"vendi um aparelho agora"` | `create_venda` | **Média** | Nenhum | Retorna pergunta de clarificação sobre modelo e valor |

---

## 2. Cadastro e Entrada de Aparelhos (`create_aparelho`)

| Frase do Lojista | Ação Esperada | Nível de Confiança | Parâmetros Extraídos | Comportamento Esperado |
| :--- | :--- | :--- | :--- | :--- |
| `"cadastra um iphone 12 128gb preto por 1800"` | `create_aparelho` | **Alta** | `marca: "Apple", modelo: "iPhone 12", capacidade: "128gb", cor: "preto", preco: 1800` | Confirma cadastro formatado com sucesso |
| `"da entrada em um 15 pro max 256gb natural titanium por 5200"` | `create_aparelho` | **Alta** | `modelo: "iPhone 15 Pro Max", capacidade: "256gb", cor: "natural titanium", preco: 5200` | Confirma cadastro formatado com sucesso |
| `"cadastra esse celular preto aqui"` | `create_aparelho` | **Média** | `cor: "preto"` | Retorna pergunta de clarificação pedindo modelo e valor |

---

## 3. Consulta de Estoque (`list_estoque`)

| Frase do Lojista | Ação Esperada | Nível de Confiança | Parâmetros Extraídos | Comportamento Esperado |
| :--- | :--- | :--- | :--- | :--- |
| `"qual nosso estoque de 15 pro max"` | `list_estoque` | **Alta** | `modelo: "iPhone 15 Pro Max"` | Responde estoque disponível com cores/baterias |
| `"quantos iphone 13 a gente tem?"` | `list_estoque` | **Alta** | `modelo: "iPhone 13"` | Responde estoque disponível |
| `"tem 14 plus?"` | `list_estoque` | **Alta** | `modelo: "iPhone 14 Plus"` | Responde estoque disponível |

---

## 4. Atualização de Preços (`update_preco`)

| Frase do Lojista | Ação Esperada | Nível de Confiança | Parâmetros Extraídos | Comportamento Esperado |
| :--- | :--- | :--- | :--- | :--- |
| `"muda o preço do aparelho X pra 3000"` | `update_preco` | **Alta** | `aparelho: "X", novoPreco: 3000` | Confirma alteração de preço formatada |
| `"altera o preco do 13 pro 128gb azul pra 2800"` | `update_preco` | **Alta** | `modelo: "iPhone 13 Pro 128gb azul", novoPreco: 2800` | Confirma alteração de preço formatada |
| `"muda o preco pra 2000"` | `update_preco` | **Média** | `novoPreco: 2000` | Retorna pergunta de clarificação: *"Qual o aparelho, código ou IMEI cujo preço deve ser alterado?"* |

---

## 5. Gestão de Fiado & Abatimento de Dívidas (`abater_divida`)

| Frase do Lojista | Ação Esperada | Nível de Confiança | Parâmetros Extraídos | Comportamento Esperado |
| :--- | :--- | :--- | :--- | :--- |
| `"abater 300 do joao"` | `abater_divida` | **Alta** | `cliente: "joao", valor: 300` | Confirma abatimento de R$ 300,00 registrado |
| `"o marcelo pagou 500 da divida dele"` | `abater_divida` | **Alta** | `cliente: "marcelo", valor: 500` | Confirma abatimento de R$ 500,00 registrado |
| `"abate o fiado do joao"` | `abater_divida` | **Média** | `cliente: "joao"` | Retorna pergunta de clarificação: *"Qual o valor a ser abatido da dívida do João?"* |

---

## 6. Mensagens Não Operacionais / Baixa Confiança (Fallback Anti-Silêncio)

| Frase | Nível de Confiança | Comportamento no Privado | Comportamento em Grupo |
| :--- | :--- | :--- | :--- |
| `"o dia hoje está muito quente"` | **Baixa** | Envia menu curto anti-silêncio | Silêncio (não flooda bate-papo de terceiros) |
| `"bom dia tudo bem?"` | **Baixa** | Envia menu curto anti-silêncio | Silêncio |
| `"onde fica a padaria?"` | **Baixa** | Envia menu curto anti-silêncio | Silêncio |
| `"kkkkkk"` | **Baixa** | Envia menu curto anti-silêncio | Silêncio |

---

## Procedimento de Teste

Execute no terminal:
```powershell
npx tsx --test src/app/api/webhook/evolution/commandExecutor.test.ts
```
Todos os testes devem passar com `0 failures`.
