# Markdown to PDF/HTML Converter & Reports API

Uma API FastAPI que fornece conversão de arquivos Markdown para PDF/HTML e relatórios detalhados de uso baseados em dados do MongoDB.

## Visão Geral

Esta API oferece duas funcionalidades principais:

1. **Conversão de Arquivos**: Converte arquivos Markdown (.md, .markdown) para PDF ou HTML
2. **Sistema de Relatórios**: Gera relatórios detalhados de uso, custos e estatísticas de usuários

## Requisitos

### Dependências Python

```bash
fastapi
uvicorn
pymongo
python-dotenv
# Dependências do módulo converter (app.converter)
```

### Variáveis de Ambiente

```bash
# Usa MONGO_URI_SERVER se definido; senão cai para MONGO_URI (mesmo do LibreChat)
MONGO_URI=mongodb://localhost:27018/LibreChat
# MONGO_URI_SERVER=mongodb://host-remoto:27018/LibreChat  # opcional, sobrescreve MONGO_URI
DEBUG_REPORTS=true   # logs extras dos relatórios (opcional)
```

## Estrutura da API

### Configuração Base

- **Host**: 0.0.0.0
- **Porta**: 15785
- **CORS**: Habilitado para todas as origens
- **Debug**: Ativado por padrão

## Endpoints de Conversão

### 1. Health Check

```http
GET /health
```

**Resposta**:

```json
{
  "status": "healthy",
  "service": "python-tools-api"
}
```

### 2. Converter Markdown para PDF

```http
POST /convert/md-to-pdf
Content-Type: multipart/form-data
```

**Parâmetros**:

- `file`: Arquivo Markdown (.md, .markdown)

**Resposta**: Stream de arquivo PDF para download

**Exemplo de uso**:

```bash
curl -X POST "http://localhost:15785/convert/md-to-pdf" \
  -F "file=@documento.md" \
  --output documento.pdf
```

### 3. Converter Markdown para HTML

```http
POST /convert/md-to-html
Content-Type: multipart/form-data
```

**Parâmetros**:

- `file`: Arquivo Markdown (.md, .markdown)

**Resposta**: Stream de arquivo HTML para download

**Exemplo de uso**:

```bash
curl -X POST "http://localhost:15785/convert/md-to-html" \
  -F "file=@documento.md" \
  --output documento.html
```

## Endpoints de Relatórios

### 4. Relatório de Uso e Custo

```http
GET /reports/usage-cost
```

**Parâmetros de Query**:

- `user` (opcional): Nome de usuário ou nome real para filtrar
- `start_date` (opcional): Data inicial (formato: YYYY-MM-DD)
- `end_date` (opcional): Data final (formato: YYYY-MM-DD)
- `models` (opcional): Lista de modelos separados por vírgula
- `search_by` (padrão: "username"): Buscar por "username" ou "name"

**Resposta**:

```json
[
  {
    "date": "05/07",
    "Custo": 65.5,
    "Mensagens": 4000
  },
  {
    "date": "06/07",
    "Custo": 150.25,
    "Mensagens": 9000
  }
]
```

### 5. Modelos Disponíveis

```http
GET /reports/available-models
```

**Resposta**: Lista de nomes de modelos ordenados por uso

```json
["gpt-4o", "claude-3", "gpt-3.5-turbo"]
```

### 6. Top Usuários por Volume

```http
GET /reports/top-users-volume
```

**Parâmetros de Query**:

- `user` (opcional): Usuário específico (retorna dados ao longo do tempo)
- `start_date`, `end_date` (opcional): Filtros de período
- `search_by` (padrão: "username"): Tipo de busca
- `limit` (padrão: 10): Número máximo de resultados

**Resposta para ranking geral**:

```json
[
  {
    "username": "rm810774",
    "name": "Rafael Da Silva Melo",
    "Volume": 12450,
    "Custo": 145.8
  }
]
```

**Resposta para usuário específico**:

```json
[
  {
    "date": "05/07",
    "Volume": 150,
    "Custo": 15.3
  }
]
```

### 7. Top Usuários por Custo

```http
GET /reports/top-users-cost
```

Mesma estrutura do endpoint anterior, mas ordenado por custo decrescente.

### 8. Top Modelos

```http
GET /reports/top-models
```

**Parâmetros similares aos endpoints de usuários**

**Resposta**:

```json
[
  {
    "name": "GPT-4o",
    "Volume": 12450,
    "Custo": 145.8,
    "value": 12450
  }
]
```

### 9. KPIs do Dashboard

```http
GET /reports/kpis
```

**Parâmetros de Query**:

- `start_date`, `end_date` (opcional): Período para cálculo

**Resposta**:

```json
{
  "totalCost": 1250.75,
  "newUsers": 45,
  "activeAccounts": 1250
}
```

### 10. Eficiência de Usuários

```http
GET /reports/user-efficiency
```

**Parâmetros similares aos outros endpoints de usuários**

**Resposta**:

```json
[
  {
    "username": "rm810774",
    "name": "Rafael Da Silva Melo",
    "Volume": 100,
    "Custo": 15.5,
    "CostPerMessage": 0.155
  }
]
```

## Estrutura do Banco de Dados

### Collections MongoDB

#### `LibreChat.transactions`

Armazena transações de uso dos modelos:

```javascript
{
  _id: ObjectId,
  user: ObjectId,           // Referência para users._id
  model: String,            // Nome do modelo usado
  tokenValue: Number,       // Valor em tokens (negativo para custos)
  createdAt: Date          // Data da transação
}
```

#### `LibreChat.users`

Dados dos usuários:

```javascript
{
  _id: ObjectId,
  name: String,            // Nome completo
  username: String,        // Nome de usuário único
  createdAt: Date         // Data de criação da conta
}
```

## Funcionalidades Auxiliares

### Função `get_user_data(search_term, search_by)`

Busca dados de usuário no MongoDB:

- **search_term**: Termo de busca (nome ou username)
- **search_by**: Tipo de busca ("name" ou "username")
- **Retorna**: Objeto do usuário ou string de erro

### Sistema de Debug

- Flag `DEBUG_REPORTS = True` ativa logs detalhados
- Logs incluem pipelines de agregação e resultados
- Útil para troubleshooting de consultas MongoDB

### Tratamento de Filtros de Data

- Período padrão: Últimos 30 dias se não especificado
- Suporte a filtros de data início/fim
- Conversão automática para timezone correto

## Agregações MongoDB

### Padrões Comuns

1. **Filtro por usuário**: Busca ObjectId na collection users
2. **Filtro por período**: Match em `createdAt` com range de datas
3. **Agrupamento por data**: Formatação para 'DD/MM'
4. **Cálculo de custos**: Divisão de `tokenValue` por -1.000.000
5. **Joins**: Lookup entre transactions e users
6. **Ordenação**: Por data, volume ou custo

### Pipeline Típico

```javascript
[
  { $match: { /* filtros */ } },
  { $addFields: { /* campos calculados */ } },
  { $group: { /* agregações */ } },
  { $lookup: { /* joins com users */ } },
  { $project: { /* seleção de campos */ } },
  { $sort: { /* ordenação */ } },
  { $limit: /* limite de resultados */ }
]
```

## Códigos de Status e Erros

### Conversão de Arquivos

- **400**: Tipo de arquivo inválido (.md/.markdown requerido)
- **500**: Erro na conversão (PDF/HTML)

### Relatórios

- **200**: Sucesso (pode retornar array vazio se sem dados)
- **500**: Erro interno (problemas de conexão/agregação)

### Mensagens de Erro Comuns

- "Usuário não encontrado": User ID não existe na base
- "Invalid file type": Extensão de arquivo não suportada
- Erros de conversão: Problemas no módulo converter

## Exemplo de Uso Completo

```python
import requests
import json

# 1. Verificar saúde da API
health = requests.get("http://localhost:15785/health")
print(health.json())

# 2. Converter Markdown para PDF
with open("documento.md", "rb") as f:
    response = requests.post(
        "http://localhost:15785/convert/md-to-pdf",
        files={"file": f}
    )
    with open("documento.pdf", "wb") as pdf:
        pdf.write(response.content)

# 3. Obter relatório de uso
usage_report = requests.get(
    "http://localhost:15785/reports/usage-cost",
    params={
        "user": "rm810774",
        "start_date": "2024-01-01",
        "end_date": "2024-12-31"
    }
)
print(json.dumps(usage_report.json(), indent=2))

# 4. KPIs do dashboard
kpis = requests.get("http://localhost:15785/reports/kpis")
print(f"Custo Total: R$ {kpis.json()['totalCost']}")
```

## Manutenção e Monitoramento

### Logs de Debug

Ativar `DEBUG_REPORTS = True` para:

- Visualizar pipelines de agregação MongoDB
- Acompanhar filtros aplicados
- Verificar resultados de consultas
- Troubleshooting de performance

### Performance

- Índices recomendados no MongoDB:
  - `transactions.user`
  - `transactions.createdAt`
  - `transactions.model`
  - `users.username`
  - `users.name`

### Backup e Recuperação

- Collections críticas: `LibreChat.transactions`, `LibreChat.users`
- Recomendado backup diário das transactions
- Política de retenção de dados históricos

## Considerações de Segurança

1. **CORS**: Configurado para aceitar qualquer origem (ajustar para produção)
2. **Validação**: Tipos de arquivo são validados antes da conversão
3. **MongoDB**: Usar autenticação e SSL em produção
4. **Rate Limiting**: Não implementado (considerar adicionar)
5. **Logs**: Evitar exposição de dados sensíveis nos logs de debug
