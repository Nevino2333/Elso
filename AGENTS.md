# AGENTS.md

<!-- context-sync -->
## 跨 IDE 上下文交接
- 会话开始：若存在 `.agent-context/HANDOFF.md`，先完整读它——项目全貌、进度、命令都在里面，读完即可开工，不必自行探索。
- 会话收尾：产生代码改动、关键决策或调试结论时，覆盖更新 `.agent-context/HANDOFF.md`
  （写断言不写线索；命令完整可复制；不贴大段代码，只写 `路径:行号`；不写敏感信息）。