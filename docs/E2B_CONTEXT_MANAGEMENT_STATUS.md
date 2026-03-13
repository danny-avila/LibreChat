# E2B 上下文管理实施状态（Phase1 + Phase2）

更新时间：2026-03-13

## 1. 已实现内容

## 1.1 Phase1：Token 分项埋点

已在路由与 Agent 两层接入 token 可观测性。

- 路由层：记录历史构建前后的消息数、token 数、是否触发压缩/摘要。
  - 文件：[api/server/routes/e2bAssistants/controller.js](api/server/routes/e2bAssistants/controller.js)
  - 日志标签：`[E2B Assistant][ContextMetrics]`

- Agent 层：记录 system/history/user 的 token 估算值，以及预算配置。
  - 文件：[api/server/services/Agents/e2bAgent/index.js](api/server/services/Agents/e2bAgent/index.js)
  - 日志标签：`[E2BAgent][TokenMetrics]`

## 1.2 Phase2：History 窗口化 + 摘要化

已新增历史构建器并替换原全量 history 直传逻辑。

- 新增模块：
  - [api/server/services/Agents/e2bAgent/historyBuilder.js](api/server/services/Agents/e2bAgent/historyBuilder.js)

- 路由接入：
  - [api/server/routes/e2bAssistants/controller.js](api/server/routes/e2bAssistants/controller.js)

- 当前策略行为：
  1. 历史消息先做文本清洗（去 UUID 噪声）。
  2. 短会话：直接透传。
  3. 长会话：保留最近窗口 + 生成结构化摘要（system 消息）。
  4. 超预算时继续裁剪最旧非 system 消息，并在必要时压缩摘要文本。

---

## 2. 默认策略（当前生效）

当前通过 `contextManagement` 配置读取，未配置时使用默认值：

- `messageWindowSize`: 10
- `historyMaxTokens`: 12000
- `summarySnippetChars`: 220
- `summaryMaxUserItems`: 6
- `summaryMaxAssistantItems`: 5
- `reserveOutputTokens`: 3000
- `toolObservationMaxChars`: 6000

说明：

- `reserveOutputTokens` 与 `toolObservationMaxChars` 目前已纳入埋点与配置读取。
- 真正用于工具 observation 压缩将在 Phase3 实施。

---

## 3. 验证结果（token 下降 + 一致性）

已新增验证脚本：

- [api/tests/e2b/validate_context_management.js](api/tests/e2b/validate_context_management.js)

执行结果：

- long-conversation：messages 89 -> 12，tokens 20913 -> 2905，下降 86.11%
- short-conversation：messages 7 -> 7，tokens 35 -> 35，下降 0.00%
- 所有一致性断言通过（最近窗口消息保留、初始目标锚点/摘要保留）

结论：

1. 长会话场景下，当前 Phase2 策略对 token 压降有效。
2. 短会话场景下，不会引入额外压缩副作用。
3. 近期上下文一致性（最近窗口）在测试中保持不变。

### 3.1 新增测试 1：路由集成测试（已通过）

脚本：

- [api/tests/e2b/integration_route_context.js](api/tests/e2b/integration_route_context.js)

验证目标：

1. 走 `controller.chat` 主链路（mock 外部依赖），确认路由层实际使用了压缩 history。
2. 确认压缩 summary 与文件 reminder 可同时存在。

执行结果：

- input db messages: 80
- output history messages: 13
- has summary: true
- has file reminder: true

### 3.2 新增测试 2：回放 AB 测试（已通过）

脚本：

- [api/tests/e2b/replay_ab_context_consistency.js](api/tests/e2b/replay_ab_context_consistency.js)

验证目标：

1. 对比“压缩关闭（baseline）/压缩开启（default）”的 token 变化。
2. 校验关键语义信号保留（目标、近期约束、近期结果、近期行动）。
3. 校验最近窗口消息逐条一致。

执行结果：

- A: messages 69 -> 12, tokens 10479 -> 1763, reduction 83.18%
- B: messages 69 -> 12, tokens 10479 -> 1763, reduction 83.18%
- C: messages 69 -> 12, tokens 10479 -> 1763, reduction 83.18%
- All replay AB checks passed.

---

## 4. 待实现内容

## 4.1 Phase3（未实现）

工具 observation 压缩（仅模型回灌通道压缩，前端展示仍保留完整输出）：

- 对 stdout/stderr/traceback 做结构化提炼。
- 保留关键统计信息、错误类型、核心栈信息。
- 限制超长工具输出进入后续 ReAct 迭代。

## 4.2 Phase4（未实现）

System Context 瘦身：

- 文件说明按需注入，减少固定提示词体积。
- artifact 上下文结构化并限制数量。

## 4.3 Phase5（未实现）

评测与灰度：

- 构建真实多轮 E2B 数据集（含图表、导出、错误恢复）。
- 指标：任务成功率、关键结论准确率、token 成本、P95 延迟。
- 通过开关灰度逐步放量。

---

## 5. 当前局限与下一步建议

当前验证为“离线构造消息”的快速回归验证，未覆盖真实线上全部分布。

补充说明：

1. 新增的路由集成测试已覆盖 `controller.chat` 的服务内链路。
2. 但两类测试都未触达真实外部 LLM API 的答案质量波动（这是下一阶段真实回放评测的范围）。

建议下一步：

1. 增加真实会话回放测试（从数据库抽样匿名会话）。
2. 落地 Phase3，并与 Phase2 联合评测“降本不降质”。
3. 为关键开关增加环境配置与发布灰度策略。
