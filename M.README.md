https://www.librechat.ai/docs/configuration/azure

https://github.com/danny-avila/LibreChat/discussions/3000

https://github.com/danny-avila/LibreChat/discussions/2222
![alt text](./m_readme_image/model_selection.png)



MCP
https://www.librechat.ai/docs/features/agents#model-context-protocol-mcp
config MPC server
https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers

SSO
https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/azure

RAG API
https://www.librechat.ai/docs/configuration/rag_api

RAG API with azure openai

https://github.com/danny-avila/LibreChat/discussions/3899

TODO: embeding is failing need to RAG_AZURE_OPENAI_ENDPOINT section config
```
2025-05-15 22:44:29 2025-05-16 02:44:29,649 - httpx - INFO - HTTP Request: POST https://easyorder.openai.azure.com/openai/deployments/text-embedding-3-large/embeddings?api-version=2024-12-01-preview "HTTP/1.1 400 Bad Request"
2025-05-15 22:44:29 2025-05-16 02:44:29,655 - root - ERROR - Failed to store data in vector DB | File ID: fc3713fa-2b8d-4b22-91c6-901db50354c9 | User ID: 6822ae367d5a9e483ef1d3a2 | Error: Error code: 400 - {'error': {'code': 'unknown_model', 'message': 'Unknown model: text-embedding-ada-002', 'details': 'Unknown model: text-embedding-ada-002'}} | Traceback: Traceback (most recent call last):
```