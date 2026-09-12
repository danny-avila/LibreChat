# OneCode S1 修改记录

日期：2026-09-08

范围：`fix/onecode-shell-optimization-20260908` 工作树中的 MCP 工作区确认。仅调整现有 JS 适配器，不增加权限引擎或修改允许目录配置。

## 目标

`syncOneCodeFilesystemMCP` 注册或更新文件系统 MCP 前，调用现有内核项目状态 API。只有 `allowed === true`、`exists === true` 且 `workspace` 为非空字符串时才继续，配置采用内核返回的规范路径。其他结果及网络、HTTP、JSON 错误均应阻止注册和更新。

## 测试命令

工作目录：工作树内 `api/`。

```sh
node ../node_modules/jest/bin/jest.js --runInBand --coverage=false server/services/OneCode/projectPicker.spec.js server/routes/onecode.spec.js server/services/Endpoints/agents/build.spec.js
```

## 过程

- 首次基线运行因工作树缺少局部依赖 `winston-daily-rotate-file` 而中止，3 个测试套件失败，0 个测试执行。
- 从原始仓库只读复制 `api/node_modules`、`packages/data-schemas/node_modules` 和 `packages/{api,data-provider,data-schemas}/dist` 到工作树，未安装依赖或修改原始仓库。
- 中间运行曾出现路由测试的沙箱 `listen EPERM`，通过允许测试在沙箱外监听临时本地端口完成检查。
- 修复测试环境后的基线：3 个测试套件通过，27 个测试通过，0 个失败。
- RED：1 个测试套件失败、2 个通过；36 个测试失败、25 个通过，共 61 个。旧代码未请求内核状态，拒绝用例仍执行注册或更新，成功用例仍使用原始输入路径。
- 最小修复：在获取 MCP registry 和 manager 前等待项目状态，只接受明确许可、目录存在和非空规范路径；之后沿用现有注册、更新和断开连接流程。
- 待运行 GREEN 和格式检查。

## 修改文件

- `api/server/services/OneCode/projectPicker.js`：注册前通过现有内核 API 确认工作区，采用返回路径。
- `api/server/services/OneCode/projectPicker.spec.js`：增加新建和更新分支的失败关闭用例；成功用例检查内核规范路径。
- `docs/ONECODE_S1_CHANGES_2026-09-08.md`：记录范围、命令与结果。
