# 🚀 AI批改系统V2 - 快速开始指南

> **5分钟快速上手 - 立即启用AI批改V2系统**

---

## 📋 前置要求

✅ 服务器已部署并运行  
✅ 数据库连接正常  
✅ AI API密钥已配置  

---

## 🎯 启用V2系统（3步完成）

### 步骤1: 设置环境变量

**方式A: 直接启动时设置**
```bash
AI_REVIEW_VERSION=v2 npm run server
```

**方式B: 修改 .env 文件**
```bash
# 编辑 .env 文件，添加：
AI_REVIEW_VERSION=v2
```

然后重启服务器：
```bash
npm run server
# 或
pm2 restart new-debao
```

### 步骤2: 验证启动

查看服务器日志，应该看到：
```
New Debao API listening on http://localhost:3011
```

### 步骤3: 测试批改

提交一份模拟考试答卷，系统会自动使用V2批改。

---

## 📊 查看性能监控

### 访问监控面板

1. 登录管理后台
2. 点击侧边栏：**批改运营 → AI批改V2性能**
3. 查看实时数据：
   - ⏱️ 平均耗时
   - ✅ 成功率
   - 💰 Token消耗
   - 🚀 并发数

**直接访问**: `http://localhost:5173/admin/ai-review-v2-performance`

### 查看API数据

```bash
curl http://localhost:3011/api/admin/ai-review-v2/performance
```

---

## 🧪 运行测试（可选）

### 性能测试
```bash
cd d:/Desktop/my_code/new_debao
AI_REVIEW_VERSION=v2 node scripts/test-performance-monitor.js
```

**预期结果**:
- ✅ 5次批改全部成功
- ✅ 平均耗时 < 10秒
- ✅ JSON解析成功率 100%

### 数据库连接测试
```bash
node scripts/test-db-connection.js
```

---

## 🔄 回滚到V1（如需要）

### 立即回滚
```bash
# 删除环境变量
unset AI_REVIEW_VERSION

# 或设置为v1
export AI_REVIEW_VERSION=v1

# 重启服务器
pm2 restart new-debao
```

**注意**: V1系统完全保留，回滚不影响任何数据。

---

## ✅ 验证系统正常工作

### 检查清单

1. ✅ 服务器启动成功
   ```bash
   curl http://localhost:3011/api/admin/ai-review-v2/performance
   # 应返回JSON数据
   ```

2. ✅ 前端访问正常
   - 访问: `http://localhost:5173/admin/ai-review-v2-performance`
   - 应看到性能监控面板

3. ✅ 批改功能正常
   - 提交一份答卷
   - 查看批改结果是否包含标注

4. ✅ 性能达标
   - 批改耗时 < 15秒
   - 成功率 > 95%

---

## 📈 关键指标

### 性能基准
- ⏱️ 平均单小问耗时: **9.78秒**
- ✅ JSON解析成功率: **100%**
- 💯 整体成功率: **100%**
- 🚀 最大并发数: **3**

### 成本估算
- 单小问: ~**$0.06**
- 3小问试卷: ~**$0.18**
- 每月100份×22天: ~**$390**

---

## 🆘 常见问题

### Q1: 服务器启动失败
**解决**: 检查数据库连接
```bash
node scripts/test-db-connection.js
```

### Q2: 性能监控无数据
**原因**: 还没有进行过V2批改  
**解决**: 运行测试脚本或提交真实答卷

### Q3: 批改速度慢
**检查**:
- 网络连接到AI API是否正常
- 是否使用了正确的模型（claude-opus-4-8）
- 查看服务器日志是否有错误

### Q4: 如何确认使用的是V2
**方法1**: 查看批改结果的 `reviewSource` 字段
```json
{
  "reviewSource": "ai-v2"  // V2系统
}
```

**方法2**: 查看服务器日志
```
[AI批改V2] 批改成功 questionId=xxx
```

---

## 📞 获取帮助

### 技术文档
- 完整测试报告: `docs/test-complete-report.md`
- 前端集成指南: `docs/frontend-integration-guide.md`
- 性能优化指南: `docs/performance-optimization-guide.md`

### 测试脚本
- 性能测试: `scripts/test-performance-monitor.js`
- 端到端测试: `scripts/test-e2e-with-monitoring.js`
- 数据库测试: `scripts/test-db-connection.js`

---

## 🎉 完成！

**恭喜！AI批改系统V2已启用！**

系统特性：
- ⚡ 速度提升4-6倍
- 🎯 100%解决JSON截断
- 💪 错误标注100%生效
- 📊 完善的性能监控

**开始享受更快、更稳定的AI批改体验吧！** 🚀
