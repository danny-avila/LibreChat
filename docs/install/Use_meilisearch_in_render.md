"# Utilizar o Meilisearch rodando no Render

## Crie uma conta

**1.** visite [https://render.com/](https://render.com/) e clique em 'Comece Grátis` para criar uma conta e fazer login

**2.** Acesse o seu painel de controle

**3.** Selecione `Novo` e depois `Serviço Web`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4edeceaf-6032-4bd0-9575-0dda76fd9958)

**4.** Adicione `https://github.com/danny-avila/LibreChat` na seção de repositórios públicos e clique em `continuar`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4f3990f9-ab91-418d-baf3-05fef306a991)

**5.** Dê um nome único e continue com a opção gratuita e clique no botão `criar serviço web` na parte inferior da página
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/ec7604ed-f833-4c23-811a-b99bdd09fb34)

**6.** Nesse momento, ele tentará implantar automaticamente, você deve cancelar a implantação, pois ela ainda não está configurada corretamente.

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/7b6973b1-68fa-4877-b78f-9cb2ee6e4f33)


## Adicione Variáveis de Ambiente

**1.** Em seguida, você vai querer ir na seção `Ambiente` do menu para adicionar manualmente as `Variáveis de Ambiente`
  - Você precisa usar o `Adicionar Variáveis de Ambiente` e adicioná-las uma de cada vez, pois adicionar um arquivo secreto não funcionará no nosso caso.

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4a1a08d5-a1f0-4e24-8393-d6740c58b19a)

**2.** Você precisa inserir este valor:

| Chave | Valor |
| --- | --- |
| ALLOW_REGISTRATION | true |
| ANTHROPIC_API_KEY | user_provided |
| BINGAI_TOKEN |  | 
| CHATGPT_TOKEN | user_provided |
| CREDS_IV | e2341419ec3dd3d19b13a1a87fafcbfb |
| CREDS_KEY | f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0 |
| HOST | 0.0.0.0 |
| JWT_REFRESH_SECRET | secret |
| JWT_SECRET | secret |
| OPENAI_API_KEY | user_provided |
| PALM_KEY | user_provided |
| PORT | 3080 |
| SESSION_EXPIRY | (1000 * 60 * 60 * 24) * 7 |

> ⬆️ **Adicione um único espaço no campo de valor para qualquer endpoint que você deseje desabilitar.**

**NÃO SE ESQUEÇA DE SALVAR SUAS ALTERAÇÕES**

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/1101669f-b793-4e0a-80c2-7784131f7dae)


**3.** Adicione também as chaves `DOMAIN_CLIENT` e `DOMAIN_SERVER` e use o endereço personalizado do render que foi atribuído a você nos campos de valor

| Chave | Valor |
| --- | --- |
| DOMAIN_CLIENT | adicione aqui o seu endereço personalizado `onrender.com` |
| DOMAIN_SERVER | adicione aqui o seu endereço personalizado `onrender.com` |

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/735afb66-0adc-4ae3-adbc-54f2648dd5a1)


## Crie e Configure seu Banco de Dados

A última coisa que você precisa fazer é criar um Banco de Dados MongoDB Atlas e obter sua string de conexão.

Siga as instruções neste documento: [Banco de dados MongoDB Online](../install/mongodb.md)

## Complete a configuração das Variáveis de Ambiente 

**1.** Volte ao render.com e insira uma última chave / valor em suas `Variáveis de Ambiente`

| Chave | Valor |
| --- | --- |
| MONGO_URI | `mongodb+srv://USERNAME:PASSWORD@render-librechat.fgycwpi.mongodb.net/?retryWrites=true&w=majority` |

**2.** **Importante**: Lembre-se de substituir `<password>` pela senha do banco de dados que você criou anteriormente (quando você fez **passo 6** da criação do banco de dados **(não deixe os `<` `>` de cada lado da senha)**

**3.** Salve as alterações

**4.** Agora você deve ter todas essas variáveis 

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/a99ef7b1-8fd3-4fd4-999f-45fc28378ad9)


## Implantação

**1.** Agora clique em `Implantação Manual` e selecione `Implantar último commit`

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/d39baffd-e15d-422e-b866-a29501795a34)

**2.** Vai levar alguns minutos

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/418ce867-b15e-4532-abcc-e4b601748a58)

**3.** Quando estiver pronto, você verá `your service is live 🎉` no console e o ícone verde `Live` no topo

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/c200e052-8a12-46b2-9f64-b3cdff146980)

## Conclusão
Agora você pode acessá-lo clicando no link, parabéns, você implantou com sucesso o LibreChat no render.com

### Nota: Se você ainda está tendo problemas, antes de criar um novo problema, por favor, procure por problemas semelhantes no nosso [#issues thread on our discord](https://discord.gg/weqZFtD9C4) ou na nossa [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) na nossa página de Discussões. Se você não encontrar um problema relevante, sinta-se à vontade para criar um novo e fornecer o máximo de detalhes possível.
"
