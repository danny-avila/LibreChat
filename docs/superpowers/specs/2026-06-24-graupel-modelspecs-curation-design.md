# Graupel modelSpecs 策展(Model Curation)设计

> **日期**: 2026-06-24 ｜ **作者**: 小天 ｜ **类型**: 功能设计(MVP 功能补齐 · 阶段3 之 ③)
>
> **关联**: [MVP 路线图](../2026-06-17-mvp-roadmap.md) §5 阶段3「③ modelSpecs 策展(模型卡像 use.ai)」；[MVP 设计 §19/§97](2026-05-21-graupel-mvp-design.md)。

---

## 1. 概述与目标

用 LibreChat 原生的 **modelSpecs** 机制把模型选择器做成 use.ai 那种**策展模型卡**:按家族分组、干净命名、带图标,锁定(`enforce`)为只显示策展卡,隐藏各端点原始 fetch 的杂乱 model id。覆盖中转站(gptsapi)上**所有实测可用**的聊天模型(含历史版本可自由切换)。

**目标**: ChatGPT/use.ai 级的模型选择体验,作为 MVP 基础功能。

## 2. 范围

**做**:
- librechat.yaml(本地)+ graupel.yaml.example(committed 模板)新增/调整端点,使 8 家族模型均可达(全走 gptsapi 单 key)。
- 配置 `modelSpecs`:`enforce: true` + `prioritize: true` + 按家族 `group` 分组的策展卡列表(~26 张),默认卡 = `gemini-2.5-flash`。
- 每张卡配 label / description / iconURL。
- 移除 librechat.yaml 中失效条目(`gemini-3.5-flash`、`gemini-3-pro-preview` — relay 不支持/不存在)。

**不做(YAGNI)**:
- 不接 gating(成本档仅在本 spec 标注,供暂停中的 MODEL_REGISTRY resume 时对齐;见 §8)。
- 不做新前端(LibreChat 原生 `ModelSelector`/`ModelSpecItem`/`SpecIcon`/`CustomGroup` 已渲染策展卡 + 分组 + 图标)。
- 不设计图标素材(内置 provider 图标用内置;其余用 iconURL 或 endpoint 名回退)。

## 3. 端点配置(全部经 gptsapi,单 `${GPTSAPI_KEY}`)

| 端点 | 类型 | 协议 | 承载家族 |
|---|---|---|---|
| `openAI` | 内置 + `OPENAI_REVERSE_PROXY=gptsapi/v1` | OpenAI Chat Completions | GPT-5.x |
| `Claude` | **custom**(原计划用内置 anthropic) | OpenAI 兼容 | Claude |
| `Gemini` | **custom**(原名 Google,**已重命名**) | OpenAI 兼容 | Gemini(修掉失效项) |
| `xAI` | **新增** custom | OpenAI 兼容 | Grok |
| `DeepSeek` | **新增** custom | OpenAI 兼容 | DeepSeek |
| `GLM` | **新增** custom | OpenAI 兼容 | GLM |
| `Kimi` | **新增** custom | OpenAI 兼容 | Kimi |
| `MiniMax` | **新增** custom | OpenAI 兼容 | MiniMax |

新增 custom 端点模板(各家):
```yaml
- name: 'xAI'
  apiKey: '${GPTSAPI_KEY}'
  baseURL: 'https://api.gptsapi.net/v1'
  models:
    default: ['grok-4.3', 'grok-4-1-fast-non-reasoning', ...]
    fetch: false
  titleConvo: true
  titleModel: 'gemini-2.5-flash-lite'   # 复用便宜模型做标题
  modelDisplayLabel: 'xAI'
  iconURL: 'xai'   # 或自带 asset URL；无内置则回退
```
> ⚠️ 实测确认:这 5 家在 gptsapi 上均经 `/v1/chat/completions`(OpenAI 兼容)调通(见 §4 实测表)。Anthropic/OpenAI 走各自原生协议的 reverse-proxy(gptsapi 兼容)。

## 4. 策展模型清单(均已实测可调通,2026-06-24)

`group` = 家族显示名;`preset.endpoint` + `preset.model` = 实际路由;成本档为**意向标注**(供 gating)。

| group | label | model id | endpoint | 意向档 |
|---|---|---|---|---|
| OpenAI | GPT-5.5 | `gpt-5.5` | openAI | expensive |
| OpenAI | GPT-5.4 | `gpt-5.4` | openAI | mid |
| OpenAI | GPT-5.4 Pro | `gpt-5.4-pro` | openAI | expensive |
| OpenAI | GPT-5.4 mini | `gpt-5.4-mini` | openAI | cheap |
| OpenAI | GPT-5.4 nano | `gpt-5.4-nano` | openAI | cheap |
| Claude | Claude Opus 4.8 | `claude-opus-4-8` | Claude | expensive |
| Claude | Claude Opus 4.7 | `claude-opus-4-7` | Claude | expensive |
| Claude | Claude Opus 4.6 | `claude-opus-4-6` | Claude | expensive |
| Claude | Claude Opus 4.5 | `claude-opus-4-5-20251101` | Claude | expensive |
| Claude | Claude Sonnet 4.6 | `claude-sonnet-4-6` | Claude | mid |
| Claude | Claude Sonnet 4.6 (Thinking) | `claude-sonnet-4-6-thinking` | Claude | mid |
| Claude | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | Claude | cheap |
| Gemini | Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Gemini | mid |
| Gemini | Gemini 3 Flash | `gemini-3-flash-preview` | Gemini | cheap |
| Gemini | **Gemini 2.5 Flash** ⭐默认 | `gemini-2.5-flash` | Gemini | cheap |
| Gemini | Gemini 2.5 Flash Lite | `gemini-2.5-flash-lite` | Gemini | cheap |
| Grok | Grok 4.3 | `grok-4.3` | xAI | mid |
| Grok | Grok 4.1 Fast | `grok-4-1-fast-non-reasoning` | xAI | cheap |
| Grok | Grok 4.20 (Reasoning) | `grok-4.20-beta-0309-reasoning` | xAI | mid |
| Grok | Grok 4.20 (Fast) | `grok-4.20-beta-0309-non-reasoning` | xAI | mid |
| Grok | Grok 4.20 Multi-Agent | `grok-4.20-multi-agent-beta-0309` | xAI | mid |
| DeepSeek | DeepSeek V4 Pro | `deepseek-v4-pro` | DeepSeek | mid |
| DeepSeek | DeepSeek V4 Flash | `deepseek-v4-flash` | DeepSeek | cheap |
| GLM | GLM-5.2 | `glm-5.2` | GLM | mid |
| GLM | GLM-5 Turbo | `glm-5-turbo` | GLM | cheap |
| Kimi | Kimi K2.6 | `kimi-k2.6` | Kimi | cheap |
| MiniMax | MiniMax M3 | `MiniMax-M3` | MiniMax | cheap |

**排除**:`gemini-3.5-flash`(relay "not support")、`gemini-3-pro-preview`(未在 /v1/models)、`-cc`/`-codex`/`-code` 编码折扣 SKU、`gemini-2.5-flash-nothinking`(冗余变体)。

> 标题/总结模型(titleModel/summaryModel)统一用便宜的 `gemini-2.5-flash-lite` 控成本。

## 5. modelSpecs 结构(librechat.yaml `modelSpecs:`)

```yaml
modelSpecs:
  enforce: true        # 只显策展卡,隐藏各端点原始 fetch 列表
  prioritize: true
  list:
    - name: 'gemini-2.5-flash'        # 唯一 key
      label: 'Gemini 2.5 Flash'
      default: true                    # 新会话默认卡
      group: 'Gemini'
      iconURL: 'google'
      description: 'Fast & efficient'
      preset:
        endpoint: 'Google'
        model: 'gemini-2.5-flash'
    - name: 'gpt-5.5'
      label: 'GPT-5.5'
      group: 'OpenAI'
      iconURL: 'openAI'
      preset: { endpoint: 'openAI', model: 'gpt-5.5' }
    # ... 其余 ~24 张卡同构
```
- `name` 全局唯一;`group` 驱动选择器分组(use.ai 式家族分块,前端 `CustomGroup` 渲染)。
- `default: true` 仅设在 `gemini-2.5-flash`。
- **`interface.modelSelect: false`(+ `endpointsMenu: false`)是 enforce 干净生效的前提**:该版 ModelSelector 始终 `[...modelSpecs, ...mappedEndpoints]` 拼接,只有 `modelSelect:false` 才清空 endpoints,选择器才只剩策展卡(否则混入裸端点 + My Agents/Assistants)。
- `iconURL`: 内置 `openAI`/`anthropic`/`google`/`xai` 用内置;`deepseek`/`glm`/`kimi`/`minimax` 若无内置则提供 asset 或回退 endpoint 名(实现期确认 `SpecIcon` 的回退行为)。

## 6. 配置文件落点

- **graupel.yaml.example**(committed,源真值):写入完整 endpoints + modelSpecs。这是交付物。
- **librechat.yaml**(gitignored,本地 active):同步同样配置以便本地验证。
- `.env` 已有 `OPENAI_REVERSE_PROXY` / `ANTHROPIC_REVERSE_PROXY` = gptsapi;`GPTSAPI_KEY` 已配。新增 custom 端点复用 `${GPTSAPI_KEY}`,无需新 key。

## 7. 前端

LibreChat 原生组件已渲染 modelSpecs:`ModelSelector.tsx` / `ModelSpecItem.tsx` / `SpecIcon.tsx` / `CustomGroup.tsx`(分组)。**预期无新前端代码**。实现期验证:enforce 下选择器只显策展卡、按 group 分块、默认选中 Gemini 2.5 Flash、切换任意卡能正常发消息。若分组/图标渲染不达 use.ai 观感,做**最小**前端微调(不重写)。

## 8. 成本档与 gating(本期不接)

- 各卡 §4 标了意向成本档(cheap/mid/expensive),**仅文档标注**。
- gating(MODEL_REGISTRY + checkBillingAccess)暂停于 `feat/stage3-gating` 分支;resume 时需把本清单的 model id → cost_tier 映射补进 `MODEL_REGISTRY`(注意新 id 如 `gpt-5.5`/`claude-opus-4-8`/`grok-4.3` 与旧 registry 不同,需对齐)。
- 本期选择器对所有登录用户显示全部卡;gating 恢复后由 `checkBillingAccess` 在发送链路按 cost_tier 拦截(免费档只 cheap)。

## 9. 验证(运行 app 观察)

1. 选择器只显 8 个家族分组的策展卡,无裸 model id 长列表(enforce 生效)。
2. 默认新会话选中 Gemini 2.5 Flash。
3. 每家族至少抽 1 张卡发消息能正常回复(覆盖 5 个新 custom 端点 + 内置 openAI/anthropic + Google)。
4. 历史版本卡(如 Claude Opus 4.5、Grok 4.20 beta)可切换且能用。
5. ⚠️ 重点确认 Claude:内置 `anthropic` 端点走 Anthropic **Messages API**(`/v1/messages`),而本 spec 的实测是经 `/v1/chat/completions`。实现期务必经真实 anthropic 端点验证 Claude 能调通(gptsapi 声称兼容 Messages 原生协议)。

### 实现期验证结果(2026-06-26,实测通过)
- 选择器:enforce + `modelSelect:false` 下只显 8 家族策展卡,默认 Gemini 2.5 Flash ✓
- 发消息实测回复正常:Gemini 2.5 Flash(custom)、GPT-5.4(内置 openAI reverse-proxy)、Claude Sonnet 4.6(custom)、Grok 4.3(custom)均回 PONG ✓;其余 4 家(DeepSeek/GLM/Kimi/MiniMax)同 custom 模式 + model id 已实测,视为可用。
- **修复 2 个 bug**:(a) 内置 anthropic 的 Messages API 经 reverse-proxy(`/v1` + `/v1/messages`)→ `/v1/v1/messages` 404 → 改用 custom `Claude`(OpenAI 兼容)端点;(b) custom 端点名 `Google` 与内置 google 提供商**名字冲突**→ 被当作 Google 原生(报 "Invalid Google Cloud credentials")→ 重命名为 `Gemini`。
- 良性噪声:控制台 `[ResumableSSE] Failed to get streamId` / TTS audio 预取报错,不影响回复渲染。

## 10. 工作量预估

- yaml 端点 + modelSpecs 配置(graupel.yaml.example + librechat.yaml):~3-4h
- 图标回退/asset + 文案:~1-2h
- 运行 app 验证 8 家族:~2-3h(逐家抽测)
- 可能的前端分组/图标微调(若需):~0-3h
- **合计 ~6-12h**(配置为主,无后端逻辑)。
