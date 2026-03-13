# E2B 上下文管理改造计划（2026-03-13）

## 1. 目标

在不降低分析质量的前提下，解决 E2B Data Analyst Agent 在多轮任务中的上下文膨胀问题，降低：

- 输入 token 成本
- 平均/长尾延迟
- 上下文超限导致的截断与不稳定

并提升：

- 多轮一致性
- 可控性（可配置的预算与压缩策略）
- 可观测性（可量化评估改造效果）

---

## 2. 当前实现现状（代码审查结论）

### 2.1 历史消息构建

E2B 路由会读取会话历史并映射为 `history`，随后直接传入 agent：

- [api/server/routes/e2bAssistants/controller.js](api/server/routes/e2bAssistants/controller.js#L700)
- [api/server/routes/e2bAssistants/controller.js](api/server/routes/e2bAssistants/controller.js#L784)

当前特点：

1. 历史按会话全量读取后映射，未按 token 预算裁剪。
2. 仅做了 UUID 文本清理，不等于 token 管理。
3. continuation 场景会追加文件 reminder system message。

### 2.2 Agent 主循环上下文增长

E2B agent 每次 LLM 调用都会发送：

- system prompt（静态 + dynamic context）
- 全部 history
- 当前 user
- 本轮迭代新增 assistant/tool 消息

见：

- [api/server/services/Agents/e2bAgent/index.js](api/server/services/Agents/e2bAgent/index.js#L270)
- [api/server/services/Agents/e2bAgent/index.js](api/server/services/Agents/e2bAgent/index.js#L676)

风险：

1. 单请求内多次工具调用导致 messages 累积增大。
2. 多轮请求中历史持续回灌，输入 token 呈阶梯上升。

### 2.3 ContextManager 的作用边界

`ContextManager` 主要管理文件与产物状态，不负责 token 预算控制：

- [api/server/services/Agents/e2bAgent/contextManager.js](api/server/services/Agents/e2bAgent/contextManager.js#L72)
- [api/server/services/Agents/e2bAgent/contextManager.js](api/server/services/Agents/e2bAgent/contextManager.js#L107)

此外，文件说明中包含较长示例代码，文件多时会明显放大 system context。

---

## 3. 多轮任务是否会 token 激增

会，且是“双层激增”模式：

1. 请求内激增：ReAct 循环每步都把更多 tool observation 加回上下文。
2. 请求间激增：上一轮长输出进入 DB，下一轮作为 history 再次回灌。

现有 `maxIterations=20` 只能防死循环，不是上下文预算治理。

---

## 4. 文献与业界最佳实践摘要

### 4.1 官方文档（工程实践）

1. OpenAI Conversation State：强调手动管理历史时要关注 context window 与 token 计费。
2. OpenAI Compaction：建议在长对话中使用 compaction（阈值触发或显式 compact），保留关键状态并缩小上下文。

参考：

- https://developers.openai.com/api/docs/guides/conversation-state
- https://developers.openai.com/api/docs/guides/compaction

### 4.2 论文（方法论）

1. Lost in the Middle (2023)：相关信息放在长上下文中部时，模型利用率明显下降。
   - 启示：不是“塞得越多越好”，应将关键状态前置并结构化。
   - https://arxiv.org/abs/2307.03172

2. Recursively Summarizing Enables Long-Term Dialogue Memory (2023/2025)：递归摘要能提升长对话一致性。
   - 启示：长期历史应摘要化，不应全量原文永久回灌。
   - https://arxiv.org/abs/2308.15022

3. MemGPT (2023)：分层记忆（工作记忆/外部记忆）适合超长上下文任务。
   - 启示：E2B 适合“短期窗口 + 长期摘要/检索记忆”架构。
   - https://arxiv.org/abs/2310.08560

4. LongMem (2023)：通过外部长期记忆增强超长历史利用能力。
   - 启示：工具结果与中间结论应进入可检索 memory，而非反复完整注入 prompt。
   - https://arxiv.org/abs/2306.07174

5. LLMLingua (2023)：提示压缩可显著降低 token，且在合理策略下性能损失可控。
   - 启示：工具 observation 的压缩有理论与实证支撑。
   - https://arxiv.org/abs/2310.05736

---

## 5. 关于 Phase 3 / Phase 4 的必要性

## 5.1 结论

- Phase 3（工具结果压缩）：有必要。
- Phase 4（system context 瘦身）：有必要，但应在 Phase 1/2 稳定后进行。

如果不做：

1. Phase 1/2 只能控制“历史”体积，无法控制“每轮工具输出”膨胀。
2. system prompt 会随文件数、artifact 数增长，仍会侵蚀预算。
3. 多轮复杂分析（大量 DataFrame 打印/错误堆栈）下，成本和延迟仍偏高。

## 5.2 会不会影响输出效果

会有风险，但可通过策略设计把风险降到可接受：

1. 保留双通道：
   - 用户展示通道保留完整 output（前端可见）。
   - 模型回灌通道使用压缩版 observation（供后续推理）。

2. 对错误信息“结构化保真”：
   - 保留 `error_type + 核心 traceback 片段 + 修复建议`。

3. 对表格信息“语义保真”：
   - 保留 `shape、列名、dtypes、缺失率、统计摘要、head/tail 样本`。

4. 灰度+AB：
   - 开关化 `toolObservationCompression`、`leanSystemContext`。
   - 对比任务成功率、人工偏好、token 与延迟，再决定默认开启。

---

## 6. 实施计划（修订版）

## Phase 1：预算与可观测性（P0）

目标：先量化问题，避免盲调。

实施：

1. 记录每轮请求指标：
   - system tokens
   - history tokens
   - tool tokens
   - total prompt tokens
   - completion tokens
2. 新增配置：
   - `historyMaxTokens`
   - `reserveOutputTokens`
   - `toolObservationMaxChars`

验收：可在日志/监控看到 token 分项与 P95。

## Phase 2：历史窗口 + 摘要记忆（P0）

目标：控制跨轮增长。

实施：

1. 新增 HistoryBuilder（建议）
   - 保留最近 N 轮原文
   - 旧轮次转结构化摘要
2. 摘要内容模板：
   - 用户目标
   - 已完成步骤
   - 关键结论
   - 当前文件/数据状态
   - 未完成事项

验收：长会话输入 tokens 明显下降且多轮一致性不下降。

## Phase 3：工具 observation 压缩（P1）

目标：控制单请求内膨胀。

实施：

1. 在 tool->LLM 回灌前进行压缩。
2. 保留机器可用关键信号，移除冗余长文本。
3. 前端显示与存档继续保留完整输出。

验收：复杂 EDA 任务中，单请求 prompt tokens 降低 20%-40%。

## Phase 4：System Context 精简（P1）

目标：减少固定成本与“中部信息丢失”。

实施：

1. 文件说明改为分级注入：
   - 默认短规则
   - 仅按文件类型注入必要示例
2. artifact 仅保留最近 K 个并结构化。

验收：system tokens 下降，文件多时稳定性提升。

## Phase 5：评测与默认策略（P0）

目标：保证“省 token 不降质”。

实施：

1. 建立 E2B 长会话评测集（10/30/60轮，含图表、错误恢复、导出文件）。
2. 关键指标：
   - 成功率
   - 关键结论正确率
   - 端到端延迟
   - token 成本
3. 设定回滚条件与阈值。

---

## 7. 建议落地顺序

1. 先做 Phase 1 + Phase 2（收益最大，改动风险低）。
2. 再做 Phase 3（控制工具输出膨胀）。
3. 最后做 Phase 4（优化系统提示固定成本）。
4. 全程由 Phase 5 评测守门。

---

## 8. 决策建议（针对当前问题）

如果目标是“短期可见收益且不冒险”：

1. 立即执行 Phase 1/2。
2. Phase 3/4 先做开关化实现，默认灰度到内部或小流量。
3. 评测通过后再全量开启。

这能兼顾你关心的两点：

- 避免 token 持续激增
- 不牺牲输出效果
