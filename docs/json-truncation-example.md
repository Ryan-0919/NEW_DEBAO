# JSON截断问题详解

## 什么是JSON截断？

我们要求AI返回一个**完整的JSON对象**，像这样：

```json
{
  "subQuestions": [{
    "id": "sub_1",
    "score": 3,
    "answerMarks": [
      {"id": "m1", "highlight": "第一个标注", "status": "score", "score": 1, "comment": "正确"},
      {"id": "m2", "highlight": "第二个标注", "status": "wrong", "comment": "错误"},
      {"id": "m3", "highlight": "第三个标注", "status": "score", "score": 0.5, "comment": "部分正确"}
    ],
    "rubricPoints": [
      {"id": "r1", "hit": true, "awardedScore": 1},
      {"id": "r2", "hit": false, "awardedScore": 0}
    ],
    "missedPoints": [
      {"id": "mp1", "title": "遗漏点", "description": "学生没有提到xxx"}
    ]
  }]
}
```

## 但实际上AI返回的是：

```json
{
  "subQuestions": [{
    "id": "sub_1",
    "score": 3,
    "reviewComment": "两个结论正确，但理由不够完整，遗漏关键要点",
    "answerMarks": [
      {"id": "m1", "highlight": "法院以"附带民事诉讼须在立案时一并提起"为由不予受理的做法是不正确", "status": "score", "score": 1, "comment": "结论正确"},
      {"id": "m2", "highlight": "附带民事诉讼应当同刑事案件一并审判", "status": "wrong", "comment": "理解偏差"},
      {"id": "m3", "highlight": "被害人提起附带民事诉讼的时间为宣告判决前", "status": "score", "score": 0.5, "comment": "部分正确"},
      {"id": "m4", "highlight": "刘某在定期宣判前委托律师的请求应当被准许"
```

**注意最后一行！** `"highlight": "刘某在定期宣判前委托律师的请求应当被准许"` 后面就**断了**！

应该继续输出：
```json
, "status": "score", "score": 1, "comment": "结论正确"},
      {"id": "m5", ...},
      ...
    ],
    "rubricPoints": [...],
    "missedPoints": [...]
  }]
}
```

但AI在中途停止了输出，JSON没有闭合，所以：
- 缺少 `"status"` 字段
- 缺少后面的 `answerMarks` 数组元素
- 缺少 `rubricPoints` 数组
- 缺少 `missedPoints` 数组
- 缺少闭合的 `}]}`

## 为什么会截断？

1. **学生答案太长**：小问3的学生答案有271个字符
2. **AI需要标注的地方多**：通常有5-6个标注点
3. **JSON结构复杂**：每个标注都有 id、highlight、status、score、comment 字段
4. **AI"累了"**：生成到一半时，AI模型决定停止输出（可能认为已经输出了"足够的内容"）

## 为什么Opus 4.8 + 25000 max_tokens 也解决不了？

即使我们：
- 用了最强的模型（Opus 4.8）
- 设置了很大的max_tokens（25000）

**问题依然存在**，因为：
- 这不是模型"能力不够"的问题
- 这不是"token不够"的问题
- 这是模型在生成复杂嵌套JSON时的**行为特征**

## 测试结果证明

在5次测试中，小问3截断了**2次**（40%概率）：
- Test 3 - 小问3：截断 ❌
- Test 5 - 小问3：截断 ❌

而小问1、小问2从不截断（因为学生答案短，标注少）。

## 解决方案

**唯一可靠的解决方案**：不要一次性要求AI返回这么复杂的JSON。

分两步返回：
1. 第一步：返回核心批改信息（answerMarks + score + reviewComment）
2. 第二步：返回补充信息（missedPoints）

这样每次返回的JSON都很小，不会截断。
