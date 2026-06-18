# Graupel MVP 总体执行路线图

> **日期**: 2026-06-17 ｜ **作者**: 小天 ｜ **类型**: 总体规划(统领 specs/ 与 plans/)
>
> **目的**: 拉齐全局——盘清 stage 1-5 基础、MVP 五功能、前端、第二大脑的真实现状与依赖,定一个合理的执行顺序。解决"第二大脑超前、基础未合、基线过时"的错位。

---

## 1. 真实现状(2026-06-17 核实)

| 模块 | 状态 | 位置 |
|---|---|---|
| **Stage 1** fork+换肤+删减+部署 | ✅ **基本完成**(换肤/ice-blue 主题/删 Assistants·Vertex·Bedrock/删 6 社交登录/graupel.yaml/Coolify/final sweep) | `stage-1/fork-rebrand` 分支(18 commits,**未合 main**) |
| **use.ai 前端** sidebar/首页 redesign | ✅ **已合 main** | main |
| **Stage 2** magic-link 登录 | ❌ 未做 | — |
| **Stage 3** plan/quota/gating | ❌ 未做(第二大脑配额 Plan E 的前置) | — |
| **Stage 4** 营销页 | ❌ 未做 | — |
| **Stage 5** 上线/监控 | ❌ 未做 | — |
| MVP-聊天(多模型) | LibreChat 现成;换肤后用 modelSpecs 策展 | main(未换肤) |
| MVP-多模态解析 | LibreChat 现成 | main |
| MVP-图片生成 plain-chat 入口 | ❌ 未做(现状 agent-only) | — |
| MVP-Memory 修缮(普通用户可见/自动/端点) | ❌ 未做 | — |
| **MVP-第二大脑** | 🟡 后端 Plan A(数据)+B(入料)✅;C/D/E/F + 前端未做 | `feat/second-brain-notes`(基于**未换肤** main) |
| 第二大脑前端 | ❌ 未做 | — |

## 2. 核心问题(错位)

1. **stage 1 做完没合 main** → main 仍是 LibreChat 品牌、仍带已删的端点/登录。
2. **第二大脑分支基线过时** → 它从未换肤的 main 切出,stage 1 合并后必须 rebase(否则删除的端点/auth 会冲突堆积)。
3. **顺序倒置** → 先做了差异化功能(第二大脑)的后端,而它依赖的 stage 3(配额)未做;第二大脑目前悬空(无前端、无配额框架、无 UI 入口)。
4. **设计验证缺口** → use.ai 前端已合 main,但是否符合既定设计未系统验证。

## 3. 关键设计修正(本次探索得出)

- **第二大脑 Plan C 改为 in-process 自定义工具,不做真 MCP server。** 探索确认:LibreChat 的 MCP 仅支持外部进程/URL transport(无 in-memory),且 MCP 工具调用不携带用户身份、不共享 Mongo 连接。而 Notes 工具需访问内部 Note DB + 按 `req.user.id` 隔离。最务实是按 `file_search` 的模式注册 in-process LangChain 工具(`handleTools.js` 加分支,工具工厂闭包拿到 `user=req.user.id` + `req`)。**应回填 spec §4/§6**(MCP → in-process builtin tool;"agent 能调笔记工具"的目的不变)。

## 4. 依赖关系

```
Stage 1(换肤/删减) ──┬──> Stage 2(登录) ──> Stage 3(plan/quota) ──> 第二大脑 Plan E(配额)
                      ├──> 其他 MVP 功能(图片入口/memory)
                      └──> rebase feat/second-brain-notes(基线更新)
第二大脑后端 A+B(已done) ──> Plan C(工具)──> Plan D(整理/检索)──> Plan F(前端)
前端框架(换肤后 client) ──> 第二大脑 Plan F + 各功能前端
Stage 3 + 功能就位 ──> Stage 4(营销)──> Stage 5(上线)
```

## 5. 推荐执行路线(阶段化)

| 阶段 | 内容 | 依赖 | 产出 |
|---|---|---|---|
| **0. 合 + 校准基线**(即时) | 把 `stage-1/fork-rebrand` 合并到 main + 验证;然后 rebase `feat/second-brain-notes` 到新 main | — | main = 已换肤、已删减的 Graupel;第二大脑基线更新 |
| **1. Stage 2 登录** | magic-link(Resend)+ 登录页改造 + onboarding,按 [stage-2 spec](specs/2026-05-21-graupel-stage-2-magic-link.md) | 阶段0 | 可用邮箱登录 |
| **2. Stage 3 计费框架** | Plan/Subscription/Quota/UsageLog schema + applyPlanChange + checkAccess gating + admin API,按 [stage-3 spec](specs/2026-05-21-graupel-stage-3-plan-gating.md) | 阶段0 | 配额/门控框架(第二大脑 Plan E 前置) |
| **3. MVP 功能补齐** | ① 图片生成 plain-chat 入口 ② Memory 修缮(普通用户可见+自动+端点) ③ modelSpecs 策展(模型卡像 use.ai) | 阶段0 | ChatGPT 级基础体验 |
| **4. 第二大脑收尾** | Plan C(in-process notes 工具)→ D(整理/检索 + 手动触发)→ E(配额,接 stage 3)→ F(前端笔记空间 + 聊天 @笔记) | 阶段2(配额)+ 阶段3 | 第二大脑端到端可用 |
| **5. Stage 4 营销** | 落地/定价/法务/waitlist 页 SSG,按 [stage-4 spec](specs/2026-05-21-graupel-stage-4-marketing.md) | 阶段1-3 | 对外页面 |
| **6. Stage 5 上线** | Sentry/PostHog/备份/邮件自动化/admin 后台,按 [stage-5 spec](specs/2026-05-21-graupel-stage-5-launch.md) | 阶段1-5 | invite-only beta 上线 |

> 第二大脑后端(A+B)已完成、不白做;它在阶段4接回主线。前端统一在换肤后的 client 上做。

## 6. 即时行动(阶段0,建议先做)

1. **验证 + 合并 `stage-1/fork-rebrand` → main**:逐项核对换肤完整性(无 LibreChat 残留)、删减无回归、graupel.yaml/部署可用;合并。
2. **rebase `feat/second-brain-notes`** 到新 main,跑通 notes 测试(用 no-AVX 前缀),解决因端点/auth 删除产生的冲突。
3. **回填 spec**:§4/§6 把 Notes "MCP server" 改为 "in-process builtin tool"(见 §3);确认无误后再做 Plan C。

## 7. 风险与决策点

| 项 | 说明 |
|---|---|
| 分支管理 | 必须先合 stage 1 再 rebase 第二大脑,否则冲突随时间堆积 |
| 第二大脑悬空 | 在阶段4前不可端到端;接受它作为"已备好的后端",或提前到阶段3后 |
| use.ai 前端符合设计? | 已合 main,需单独验证是否符合既定设计(可作为阶段3前端工作的一部分) |
| 配额数值 | `quota.notes` 及各 plan 数值待 stage-4 竞品研究 + stage-5 真实数据校准 |
| 工作量 | 单人 ~10h/周;阶段1-3 各 20-30h,阶段4(第二大脑收尾)~30-40h,阶段5-6 各 20-25h |

## 8. 待用户拍板

- 路线整体顺序认可?(基础 stage 1-3 优先,第二大脑阶段4接回)
- 阶段0(合 stage 1 + rebase)是否现在就做?
- 第二大脑前端要不要和 use.ai 前端风格统一(同一设计语言)?
