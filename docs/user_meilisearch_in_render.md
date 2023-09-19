# Utilizar o Render no Meilisearch

## Crie uma conta ou um novo projeto

**1.** visite [https://render.com/](https://render.com/) e clique em 'Comece Grátis` para criar uma conta e fazer login

**2.** Acesse o seu painel de controle

**3.** Selecione `Novo` e depois `Serviço Web`
  
  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/4edeceaf-6032-4bd0-9575-0dda76fd9958)

**4.** Adicione `https://github.com/itzraiss/Meilisearch` na seção de repositórios públicos e clique em `continuar`
  
  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184044.png)

**5.** Dê um nome único e continue com a opção gratuita e clique no botão `criar serviço web` na parte inferior da página
  
  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20185545.png)

## Clique em Advanced para adicionar as Variáveis de Ambiente  
  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_185841007.png)

## Adicione as Variáveis de Ambiente

**1.** Para adicionar manualmente as `Variáveis de Ambiente`
  - Você precisa usar o `Adicionar Variáveis de Ambiente` e adicioná-las uma de cada vez, pois adicionar um arquivo secreto não funcionará no nosso caso.

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184259.png)

**2.** Você precisa inserir este valor:

| Chave | Valor |
| --- | --- |
| MEILI_HOST | http://meilisearch:7700 |
| MEILI_HTTP_ADDR | meilisearch:7700 |
| MEILI_MASTER_KEY | DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt | 
| MEILI_NO_ANALYTICS | true |

**Implantação**

**1.** Está tudo condigurado, agora só basta clicar em Create Web Service

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184303.png)

**2.** Vai levar alguns minutos

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/418ce867-b15e-4532-abcc-e4b601748a58)

**3.** Quando estiver pronto, você verá `your service is live 🎉` no console e o ícone verde `Live` no topo

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_192433154.png)


**Obtendo Endereço URL**

Após receber a mensagem: `your service is live 🎉`, é obrigatório que copie o endereço do render:

  ![image](https://github.com/itzraiss/images/blob/main/Captura%20de%20tela%202023-09-19%20184509.png)

## No projeto do LibreChat

A última coisa que você precisa fazer é inserir em "MEILI_HOST" na aba de Enviroments o endereço do seu projeto do Meilisearch no Render

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_190801655.png)

## Implantação

**1.** Agora clique em `Implantação Manual` e selecione `Implantar último commit`

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/d39baffd-e15d-422e-b866-a29501795a34)

**2.** Vai levar alguns minutos

  ![image](https://github.com/fuegovic/LibreChat/assets/32828263/418ce867-b15e-4532-abcc-e4b601748a58)

**3.** Quando estiver pronto, você verá `your service is live 🎉` no console e o ícone verde `Live` no topo

  ![image](https://github.com/itzraiss/images/blob/main/imagem_2023-09-19_192433154.png)

## Conclusão
Agora você poderá realizar pesquisas novamente, parabéns, você implantou com sucesso o Meilisearch no render.com

### Nota: Se você ainda está tendo problemas, antes de criar um novo problema, por favor, procure por problemas semelhantes no nosso [#issues thread on our discord](https://discord.gg/weqZFtD9C4) ou na nossa [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) na nossa página de Discussões. Se você não encontrar um problema relevante, sinta-se à vontade para criar um novo e fornecer o máximo de detalhes possível.
