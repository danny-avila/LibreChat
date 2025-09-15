# 🛠️ Guia Completo de Ferramentas (Tools) - LibreChat

## 📋 Índice
- [Visão Geral](#visão-geral)
- [Estrutura do Sistema](#estrutura-do-sistema)
- [Como Criar uma Nova Ferramenta](#como-criar-uma-nova-ferramenta)
- [Configuração e Visibilidade](#configuração-e-visibilidade)
- [Docker e Deploy](#docker-e-deploy)
- [Troubleshooting](#troubleshooting)
- [Ferramentas Disponíveis](#ferramentas-disponíveis)
- [Comandos Úteis](#comandos-úteis)
- [Exemplos Práticos](#exemplos-práticos)

## Visão Geral

As ferramentas (tools) no LibreChat são extensões que permitem aos agentes realizar ações específicas como buscar na web, gerar imagens, fazer cálculos, etc. Elas são baseadas no framework LangChain e seguem um padrão consistente de implementação.

### Conceitos Importantes
- **Tool**: Classe que estende `@langchain/core/tools`
- **Plugin Key**: Identificador único da ferramenta
- **API Key**: Credencial necessária para ferramentas externas
- **Schema**: Definição dos parâmetros usando Zod

## Estrutura do Sistema

```
api/app/clients/tools/
├── structured/              # Implementação das ferramentas
│   ├── PerplexitySearch.js
│   ├── TavilySearchResults.js
│   └── ...
├── manifest.json           # Registro e metadados
├── manifest.js            # Mapeamento das ferramentas
├── index.js              # Exportação das ferramentas
└── util/
    └── handleTools.js    # Carregamento e inicialização
```

## Como Criar uma Nova Ferramenta

### 1️⃣ Implementar a Ferramenta

Crie o arquivo em `api/app/clients/tools/structured/MinhaFerramenta.js`:

```javascript
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

/**
 * Ferramenta customizada para [descrição]
 */
class MinhaFerramenta extends Tool {
  static lc_name() {
    return 'MinhaFerramenta';
  }

  constructor(fields = {}) {
    super();

    // Nome único da ferramenta (snake_case)
    this.name = 'minha_ferramenta';

    // Descrição clara para o LLM entender quando usar
    this.description = 'Use esta ferramenta para [ação específica]';

    // Permite carregamento sem credenciais para desenvolvimento
    this.override = fields.override ?? false;

    // Configuração da API Key (se necessário)
    this.apiKey =
      fields.MINHA_API_KEY ||
      getEnvironmentVariable('MINHA_API_KEY');

    if (!this.apiKey && !this.override) {
      throw new Error('Missing MINHA_API_KEY environment variable');
    }

    // Define os parâmetros de entrada usando Zod
    this.schema = z.object({
      query: z.string().min(1).describe('A consulta a ser processada'),
      maxResults: z.number().optional().default(5).describe('Número máximo de resultados'),
      // Adicione outros parâmetros conforme necessário
    });
  }

  async _call(input) {
    // Valida os parâmetros de entrada
    const validation = this.schema.safeParse(input);
    if (!validation.success) {
      throw new Error(`Validation failed: ${JSON.stringify(validation.error.issues)}`);
    }

    const { query, maxResults } = validation.data;

    try {
      // Implementar a lógica principal aqui
      const response = await fetch('https://api.exemplo.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ query, limit: maxResults })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Retornar resultado formatado como string
      return this.formatResults(data);

    } catch (err) {
      console.error('Erro ao executar ferramenta:', err);
      return `Erro: ${err.message}`;
    }
  }

  formatResults(data) {
    // Formatar os resultados para exibição
    if (!data.results || data.results.length === 0) {
      return 'Nenhum resultado encontrado.';
    }

    return data.results
      .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
      .join('\n');
  }
}

module.exports = MinhaFerramenta;
```

### 2️⃣ Registrar no Manifest

Adicione em `api/app/clients/tools/manifest.json`:

```json
{
  "name": "Minha Ferramenta",
  "pluginKey": "minha_ferramenta",
  "description": "Descrição detalhada para o usuário",
  "icon": "https://exemplo.com/icon.png",
  "authConfig": [
    {
      "authField": "MINHA_API_KEY",
      "label": "API Key da Minha Ferramenta",
      "description": "Obtenha sua API key em <a href='https://exemplo.com'>exemplo.com</a>"
    }
  ]
}
```

### 3️⃣ Exportar no Index

Adicione em `api/app/clients/tools/index.js`:

```javascript
// No topo do arquivo
const MinhaFerramenta = require('./structured/MinhaFerramenta');

// No module.exports
module.exports = {
  ...manifest,
  // Outras ferramentas...
  MinhaFerramenta,
};
```

### 4️⃣ Registrar no HandleTools

Adicione em `api/app/clients/tools/util/handleTools.js`:

```javascript
// Dentro da função loadTools
const toolConstructors = {
  // Outras ferramentas...
  minha_ferramenta: MinhaFerramenta,
};
```

### 5️⃣ Configurar Variáveis de Ambiente

Adicione no `.env`:

```bash
# Minha Ferramenta
MINHA_API_KEY=sua_chave_api_aqui
```

## Configuração e Visibilidade

### No librechat.yaml

#### Opção 1: Lista de Inclusão (Whitelist)
```yaml
# Mostra APENAS estas ferramentas
includedTools:
  - "perplexity_search"
  - "minha_ferramenta"
  - "google"
```

#### Opção 2: Lista de Exclusão (Blacklist)
```yaml
# Mostra TODAS exceto estas
filteredTools:
  - "calculator"
  - "wolfram"
```

⚠️ **Importante**:
- Sem configuração = todas as ferramentas com API keys aparecem
- `includedTools` tem prioridade sobre `filteredTools`
- Ferramentas sem API key configurada não aparecem

### Configuração para Agentes

```yaml
endpoints:
  agents:
    capabilities:
      - "tools"           # Habilita ferramentas
      - "execute_code"    # Code interpreter
      - "file_search"     # Busca em arquivos
      - "web_search"      # Busca na web
```

## Docker e Deploy

### Docker Compose Override

Para que ferramentas customizadas funcionem no Docker, adicione em `docker-compose.override.yml`:

```yaml
version: '3.8'

services:
  api:
    volumes:
      # Arquivos essenciais das ferramentas
      - ./api/app/clients/tools/manifest.json:/app/api/app/clients/tools/manifest.json:ro
      - ./api/app/clients/tools/manifest.js:/app/api/app/clients/tools/manifest.js:ro
      - ./api/app/clients/tools/index.js:/app/api/app/clients/tools/index.js:ro
      - ./api/app/clients/tools/util/handleTools.js:/app/api/app/clients/tools/util/handleTools.js:ro

      # Sua ferramenta customizada
      - ./api/app/clients/tools/structured/MinhaFerramenta.js:/app/api/app/clients/tools/structured/MinhaFerramenta.js:ro

      # Configuração
      - ./librechat.yaml:/app/librechat.yaml:ro
```

### Rebuild e Deploy

```bash
# Parar containers
sudo docker compose down

# Limpar cache (importante!)
sudo docker system prune -f

# Rebuild sem cache
sudo docker compose build --no-cache api

# Iniciar
sudo docker compose up -d

# Verificar logs
sudo docker compose logs -f api
```

## Troubleshooting

### Problema: Ferramenta não aparece na interface

**Causas e Soluções:**

1. **API Key não configurada**
   ```bash
   # Verificar se a variável existe
   grep "MINHA_API_KEY" .env
   ```

2. **Cache do Docker**
   ```bash
   sudo docker compose down
   sudo docker compose build --no-cache api
   sudo docker compose up -d
   ```

3. **Arquivo não montado no Docker**
   - Verificar `docker-compose.override.yml`
   - Confirmar que o volume está montado

4. **Erro no código**
   ```bash
   # Testar ferramenta diretamente
   sudo docker compose exec api node -e "
   const Tool = require('/app/api/app/clients/tools/structured/MinhaFerramenta.js');
   try {
     const t = new Tool({ override: true });
     console.log('✅ Sucesso:', t.name);
   } catch(e) {
     console.error('❌ Erro:', e.message);
   }
   "
   ```

### Problema: MODULE_NOT_FOUND

**Causa:** Uso de alias `~` nos imports

**Solução:** Não use `require('~/config')`, use paths relativos ou absolutos:
```javascript
// ❌ Errado
const { logger } = require('~/config');

// ✅ Correto
const { logger } = require('../../../config');
// Ou simplesmente use console.error
```

### Problema: Permissão negada

```bash
# Corrigir permissões
sudo chmod 666 api/app/clients/tools/structured/MinhaFerramenta.js
sudo chmod 666 api/app/clients/tools/manifest.json
```

### Problema: Ferramenta não funciona

**Checklist de Debug:**

1. ✅ Nome em `this.name` corresponde ao `pluginKey`?
2. ✅ Classe estende `Tool` do `@langchain/core/tools`?
3. ✅ Método `_call()` está implementado?
4. ✅ Schema Zod está correto?
5. ✅ API Key está no formato correto?

## Ferramentas Disponíveis

| Ferramenta | Plugin Key | API Key | Descrição |
|------------|------------|---------|-----------|
| **Perplexity** | `perplexity_search` | `PERPLEXITY_API_KEY` | Busca web com fontes citadas |
| **Google Search** | `google` | `GOOGLE_CSE_ID` + `GOOGLE_SEARCH_API_KEY` | Busca Google customizada |
| **Tavily** | `tavily_search_results_json` | `TAVILY_API_KEY` | Busca otimizada para LLMs |
| **DALL-E 3** | `dalle` | `OPENAI_API_KEY` | Geração de imagens |
| **Flux** | `flux` | `FLUX_API_KEY` | Geração de imagens alternativa |
| **YouTube** | `youtube` | `YOUTUBE_API_KEY` | Busca e análise de vídeos |
| **Wolfram** | `wolfram` | `WOLFRAM_APP_ID` | Cálculos e conhecimento |
| **OpenWeather** | `open_weather` | `OPENWEATHER_API_KEY` | Dados meteorológicos |
| **Calculator** | `calculator` | - | Cálculos matemáticos |
| **Stable Diffusion** | `stable-diffusion` | `SD_WEBUI_URL` | Geração de imagens local |

## Comandos Úteis

### Desenvolvimento

```bash
# Listar todas as ferramentas registradas
cat api/app/clients/tools/manifest.json | jq -r '.[].pluginKey'

# Verificar API keys configuradas
grep -E "_KEY|_API" .env | grep -v "^#"

# Testar ferramenta específica
sudo docker compose exec api node -e "
const Tool = require('/app/api/app/clients/tools/structured/NomeDaFerramenta.js');
const t = new Tool({ override: true });
console.log('Nome:', t.name);
console.log('Descrição:', t.description);
"

# Ver ferramentas carregadas via API
curl -s http://localhost:3080/api/agents/tools | jq '.[] | {name, pluginKey}'
```

### Docker

```bash
# Verificar se arquivo existe no container
sudo docker compose exec api ls /app/api/app/clients/tools/structured/ | grep Minha

# Ver logs de erro
sudo docker compose logs api | grep -i error | tail -20

# Reiniciar apenas o API
sudo docker compose restart api

# Rebuild completo forçado
sudo docker compose down -v
sudo docker rmi $(docker images -q librechat*)
sudo docker compose up -d --build
```

### Debug

```bash
# Verificar se ferramenta está no manifest dentro do container
sudo docker compose exec api grep -A5 "minha_ferramenta" /app/api/app/clients/tools/manifest.json

# Testar carregamento de todas as ferramentas
sudo docker compose exec api node -e "
const tools = require('/app/api/app/clients/tools');
Object.keys(tools).forEach(t => console.log(t));
"

# Ver cache de configuração
sudo docker compose exec api redis-cli FLUSHALL 2>/dev/null || echo 'Sem Redis'
```

## Exemplos Práticos

### Exemplo 1: Ferramenta de Busca Simples

```javascript
// api/app/clients/tools/structured/SimpleBusca.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');

class SimpleBusca extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'simple_busca';
    this.description = 'Busca simples em base de dados local';

    this.schema = z.object({
      termo: z.string().describe('Termo de busca')
    });

    // Base de dados simulada
    this.database = [
      { id: 1, titulo: 'JavaScript', descricao: 'Linguagem de programação' },
      { id: 2, titulo: 'Python', descricao: 'Linguagem versátil' },
      { id: 3, titulo: 'Docker', descricao: 'Containerização' }
    ];
  }

  async _call(input) {
    const { termo } = this.schema.parse(input);

    const resultados = this.database.filter(item =>
      item.titulo.toLowerCase().includes(termo.toLowerCase()) ||
      item.descricao.toLowerCase().includes(termo.toLowerCase())
    );

    if (resultados.length === 0) {
      return 'Nenhum resultado encontrado.';
    }

    return resultados
      .map(r => `- ${r.titulo}: ${r.descricao}`)
      .join('\n');
  }
}

module.exports = SimpleBusca;
```

### Exemplo 2: Integração com API Externa

```javascript
// api/app/clients/tools/structured/NewsAPI.js
const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');

class NewsAPI extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'news_api';
    this.description = 'Busca notícias recentes sobre qualquer tópico';

    this.override = fields.override ?? false;
    this.apiKey = fields.NEWS_API_KEY || getEnvironmentVariable('NEWS_API_KEY');

    if (!this.apiKey && !this.override) {
      throw new Error('Missing NEWS_API_KEY');
    }

    this.schema = z.object({
      query: z.string().describe('Tópico das notícias'),
      language: z.enum(['pt', 'en', 'es']).optional().default('pt')
    });
  }

  async _call(input) {
    const { query, language } = this.schema.parse(input);

    try {
      const url = new URL('https://newsapi.org/v2/everything');
      url.searchParams.append('q', query);
      url.searchParams.append('language', language);
      url.searchParams.append('sortBy', 'relevancy');
      url.searchParams.append('pageSize', '5');

      const response = await fetch(url, {
        headers: {
          'X-Api-Key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`News API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.articles || data.articles.length === 0) {
        return 'Nenhuma notícia encontrada sobre este tópico.';
      }

      return data.articles
        .map((article, i) =>
          `${i + 1}. **${article.title}**\n` +
          `   ${article.description || 'Sem descrição'}\n` +
          `   Fonte: ${article.source.name} | ${new Date(article.publishedAt).toLocaleDateString('pt-BR')}`
        )
        .join('\n\n');

    } catch (error) {
      console.error('Erro ao buscar notícias:', error);
      return `Erro ao buscar notícias: ${error.message}`;
    }
  }
}

module.exports = NewsAPI;
```

## Boas Práticas

### ✅ DO's (Fazer)

1. **Sempre validar entrada** com Zod schema
2. **Tratar erros** graciosamente
3. **Retornar strings** formatadas do método `_call()`
4. **Documentar parâmetros** no schema
5. **Usar `override: true`** para desenvolvimento
6. **Logs com console.error** (não use `require('~/config')`)
7. **Testar localmente** antes do deploy

### ❌ DON'Ts (Não Fazer)

1. **Não use imports com alias** (`~/`)
2. **Não retorne objetos** do `_call()` - sempre strings
3. **Não exponha API keys** em logs
4. **Não faça requests síncronos** - use async/await
5. **Não ignore validação** de entrada
6. **Não commite credenciais** no código

## Referências

- [LangChain Tools Documentation](https://js.langchain.com/docs/modules/agents/tools/)
- [Zod Schema Validation](https://zod.dev/)
- [LibreChat GitHub](https://github.com/danny-avila/LibreChat)

---

📝 **Última atualização**: Dezembro 2024
🔧 **Versão do LibreChat**: Fork customizado
📧 **Suporte**: Consulte AGENTS.md e CLAUDE.md para mais informações