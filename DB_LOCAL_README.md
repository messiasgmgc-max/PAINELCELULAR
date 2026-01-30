# Database Local - Clientes

## 📋 Como funciona

O sistema usa **JSON** armazenado em arquivos locais (`/data/clientes.json`). Isso permite:
- ✅ Desenvolvimento rápido sem configurar Supabase
- ✅ Migração fácil para Supabase depois
- ✅ Funciona offline

## 🚀 Como usar

### 1. **No Frontend (React)**

Use o hook `useClientes`:

```tsx
"use client";

import { useClientes } from "@/hooks/useClientes";
import { useEffect } from "react";

export default function Clientes() {
  const { clientes, loading, fetchClientes, criarCliente } = useClientes();

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleAdicionar = async () => {
    await criarCliente({
      nome: "João",
      email: "joao@example.com",
      telefone: "(11) 98765-4321",
      ativo: true,
    });
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div>
      <button onClick={handleAdicionar}>Adicionar Cliente</button>
      {clientes.map((cliente) => (
        <div key={cliente.id}>{cliente.nome}</div>
      ))}
    </div>
  );
}
```

### 2. **API REST**

#### GET - Listar clientes
```bash
curl http://localhost:3000/api/clientes
```

#### GET - Buscar clientes
```bash
curl "http://localhost:3000/api/clientes?termo=João"
```

#### POST - Criar cliente
```bash
curl -X POST http://localhost:3000/api/clientes \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "email": "joao@example.com",
    "telefone": "(11) 98765-4321",
    "cpf": "123.456.789-00",
    "endereco": "Rua X, 123",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "01234-567",
    "ativo": true
  }'
```

#### GET - Um cliente específico
```bash
curl http://localhost:3000/api/clientes/550e8400-e29b-41d4-a716-446655440000
```

#### PUT - Atualizar cliente
```bash
curl -X PUT http://localhost:3000/api/clientes/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"nome": "João Silva Atualizado"}'
```

#### DELETE - Deletar cliente
```bash
curl -X DELETE http://localhost:3000/api/clientes/550e8400-e29b-41d4-a716-446655440000
```

## 📁 Estrutura

```
src/
├── lib/db/
│   ├── clients.ts       # Funções CRUD
│   └── types.ts         # Tipos TypeScript
├── hooks/
│   └── useClientes.ts   # Hook React
└── app/api/clientes/
    ├── route.ts         # GET (listar), POST (criar)
    └── [id]/route.ts    # GET, PUT, DELETE
    
data/
└── clientes.json        # Arquivo de dados
```

## 🔄 Migração para Supabase

Depois que configurar Supabase:
1. Crie a tabela `clientes` com mesmos campos
2. Substitua as funções em `src/lib/db/clients.ts` para usar `supabaseAdmin`
3. As API routes e hooks funcionam igual!

## ✨ Campos do Cliente

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| id | UUID | ✅ (automático) |
| nome | string | ✅ |
| email | string | ✅ |
| telefone | string | ✅ |
| cpf | string | ❌ |
| endereco | string | ❌ |
| cidade | string | ❌ |
| estado | string | ❌ |
| cep | string | ❌ |
| dataCadastro | ISO string | ✅ (automático) |
| ativo | boolean | ✅ (padrão: true) |
