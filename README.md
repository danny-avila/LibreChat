# Bizu

Bizu é um fork simplificado do LibreChat, focado em PT-BR e em uma experiência de chat rápida e utilitária para usuários sensíveis a preço, usando modelos via OpenRouter.

## Escopo atual
- Chat básico com streaming e busca na web.
- Seleção de modelos com bloqueio/etiqueta de upgrade (planos: free, basic_cn, pro_global futuro).
- OpenRouter como provedor principal.
- Interface apenas em PT-BR.

## O que removemos nesta fase
- Automação/infra de OSS e contêineres (GitHub Actions, Helm, Docker/Compose, redis cluster, e2e Playwright).
- Licença e changelog do projeto original.
- Idiomas não PT-BR.
- Exemplos/artefatos de deploy do LibreChat que não fazem parte do Bizu.

## Estrutura do repositório
- `packages/*`: stack principal a ser usada no Bizu.
- `api/` e `client/`: legado do LibreChat, mantido apenas como referência (não ativo na fase atual).

## Próximos passos
- Fase 2: esconder agentes, imagens, arquivos, presets e áudio na UI.
- Integrar Supabase Auth + Stripe (basic_cn) e limites pós-resposta por plano.
- Ajustar seletor de modelos com dados vindos do backend de planos/modelos.

