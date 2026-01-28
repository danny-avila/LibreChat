# Azure OpenAI 配置修改记录

## 修改日期
2025年12月24日

## 修改文件
- `/home/airi/LibreChat/librechat.yaml`

## 修改内容

### Azure OpenAI Groups 配置更新

#### 修改前
```yaml
groups:
  - group: "your-resource-group"
    apiKey: "${YOUR_AZURE_API_KEY_HERE}"
    instanceName: "your-instance-name"
    deploymentName: "gpt-5-mini"
    version: "2025-01-01-preview"
    
    # 模型配置 - 必需字段
    models:
      gpt-4-1106-preview: true
```

#### 修改后
```yaml
groups:
  - group: "hkubs-airi"
    apiKey: "YOUR_AZURE_API_KEY_HERE"
    instanceName: "hkubs-airi"
    version: "2025-01-01-preview"
    
    # 模型配置
    models:
      gpt-5-mini:
        deploymentName: "gpt-5-mini"
      text-embedding-3-large:
        deploymentName: "text-embedding-3-large"
```

## 配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| group | hkubs-airi | Azure 资源组名称 |
| apiKey | A4J32nz...5Y2w | Azure OpenAI API 密钥 |
| instanceName | hkubs-airi | Azure OpenAI 实例名称（从 endpoint URL 提取） |
| version | 2025-01-01-preview | API 版本 |

## 模型部署

| 模型名称 | 部署名称 | 用途 |
|----------|----------|------|
| gpt-5-mini | gpt-5-mini | 主要对话模型 |
| text-embedding-3-large | text-embedding-3-large | 文本嵌入模型 |

## 环境变量来源

```
AZURE_OPENAI_ENDPOINT=https://hkubs-airi.cognitiveservices.azure.com/
AZURE_OPENAI_API_KEY=YOUR_AZURE_API_KEY_HERE
AZURE_OPENAI_API_VERSION=2025-01-01-preview
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_DEPLOYMENT_EMBEDDING=text-embedding-3-large
```

## 备注
- `instanceName` 从 endpoint URL `https://hkubs-airi.cognitiveservices.azure.com/` 中提取
- 移除了顶层的 `deploymentName` 字段，改为在 `models` 中为每个模型单独配置
