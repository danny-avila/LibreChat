# E2B 端到端真实 API 量化报告（2026-03-13）

## 1. 测试目标

验证在真实调用链路（LLM API + E2B Sandbox）下，Phase2 历史压缩是否带来可量化收益，并观察输出一致性与执行行为。

---

## 2. 测试方式

脚本：

- [api/tests/e2b/e2e_real_context_report.js](api/tests/e2b/e2e_real_context_report.js)

链路：

1. 使用真实 Provider（本次自动回退到 Azure OpenAI）
2. 使用真实 E2B 沙箱执行 Python 工具调用
3. 对同一任务做 A/B：
   - Baseline：全量历史
   - Compressed：Phase2 压缩历史
4. 输出量化指标：
   - history message 数
   - history token 数
   - history token 降幅
   - 端到端耗时
   - 工具步骤数
   - 输出文本相似度（Jaccard）

---

## 3. 环境与模型

- Provider: `azure`
- Model: `gpt-4.1`（部署名）
- Token 估算模型: `gpt-4o`
- E2B 模板: `xed696qfsyzpaei3ulh5`

---

## 4. 量化结果

```json
{
  "provider": "azure",
  "model": "gpt-4.1",
  "tokenModel": "gpt-4o",
  "history": {
    "baselineMessages": 89,
    "compressedMessages": 12,
    "baselineTokens": 8710,
    "compressedTokens": 1520,
    "historyTokenReductionPct": 82.55
  },
  "execution": {
    "baselineLatencyMs": 21182,
    "compressedLatencyMs": 20846,
    "baselineSteps": 2,
    "compressedSteps": 2,
    "outputJaccardSimilarity": 0.3158,
    "baselineOutputChars": 208,
    "compressedOutputChars": 384
  }
}
```

核心结论：

1. 历史 token 从 `8710` 降到 `1520`，降幅 `82.55%`。
2. 两组都完成了相同步骤数（2 步：执行代码 + 完成总结）。
3. 该样本下端到端耗时接近（约 21s）。
4. 输出相似度（Jaccard）为 `0.3158`，原因是压缩组保留了更多“计划+解释”文本，语义结论仍一致（均值/中位数/标准差一致）。

---

## 5. 结果解读

- token 降幅显著，证明 Phase2 在真实 API 端到端调用下仍有效。
- 耗时未显著下降，当前主要受外部调用与沙箱创建耗时影响。
- 文本相似度指标偏低并不直接代表质量下降：
  - 两组都包含正确关键数值
  - 差异主要在输出风格与冗余叙述长度

---

## 6. 限制与注意事项

1. 本次为单任务样本，需要扩展为多任务评测集（统计稳定性）。
2. 日志中出现了 `messages.find() buffering timed out`：
   - 来自 agent 的“历史文件恢复”辅助查询
   - 本次无文件场景，不影响最终任务完成
   - 建议后续将该查询做超时降级或无文件短路
3. 当前一致性指标为词级 Jaccard，建议补充：
   - 关键数值一致率
   - 任务成功率
   - 人工偏好评分

---

## 7. 建议下一步

1. 扩展 20-50 个真实回放样本，做批量 E2E 报告。
2. 引入“关键数值/约束一致率”作为主质量指标，Jaccard 仅作辅助。
3. 开始 Phase3（工具 observation 压缩），再做同样 E2E A/B 对比。