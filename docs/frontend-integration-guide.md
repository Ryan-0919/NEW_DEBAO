# AI批改系统V2 - 前端集成指南

## 📋 概述

AI批改系统V2采用分阶段批改架构，使用并发执行优化性能，返回完整的批改结果包括：
- ✓ 得分点标注（绿色对勾）
- ✗ 错误点标注（红色打叉）
- 划线高亮（highlight字段）
- 遗漏点提示（missedPoints）

---

## 🔌 API接口

### 请求接口

**现有接口保持不变**，后端自动使用V2系统：

```javascript
// POST /api/mock-exams/:recordId/ai-review
// 或者其他现有的批改接口
```

**环境变量配置：**
```bash
AI_REVIEW_VERSION=v2  # 启用V2系统
```

---

## 📦 返回数据结构

### 完整的批改结果JSON

```javascript
{
  "source": "ai",
  "reviewSource": "ai-v2-phase",          // V2系统标识
  "reviewProvider": "openai-compatible",
  "version": "v2",
  
  "totalScore": 12,                       // 所有小问总得分
  "maxScore": 15,                         // 所有小问总满分
  
  "subQuestions": [
    {
      "id": "sub_1",                      // 小问ID
      "title": "小问标题",
      "answer": "学生答案全文...",
      
      "score": 4,                         // 本小问得分
      "maxScore": 5,                      // 本小问满分
      "reviewComment": "结论正确但理由不完整",  // 总评（20-30字）
      
      // ========== 核心字段：答案标注 ==========
      "answerMarks": [
        {
          "id": "m1",
          "highlight": "陈某提起的自诉属于法定自诉案件范围",  // 📍 学生答案中的原文片段
          "status": "score",              // 标注类型：score（得分）/ wrong（错误）
          "score": 2,                     // 本标注得分
          "comment": "结论正确"            // 简短评语（3-4字）
        },
        {
          "id": "m2",
          "highlight": "陈某有监控录像、伤情鉴定等证据",
          "status": "score",
          "score": 1,
          "comment": "有证据"
        },
        {
          "id": "m3",
          "highlight": "公安机关认为陈某情节显著轻微",
          "status": "wrong",              // ❌ 错误标注
          "score": 0,
          "comment": "主体写反"
        }
      ],
      
      // ========== 采分点命中情况 ==========
      "rubricPoints": [
        {
          "id": "r1",
          "title": "结论正确",
          "score": 2,                     // 本采分点满分
          "hit": true,                    // 是否命中
          "awardedScore": 2               // 实际给分
        },
        {
          "id": "r2",
          "title": "说明公诉转自诉",
          "score": 1,
          "hit": false,                   // 未命中
          "awardedScore": 0
        }
      ],
      
      // ========== 遗漏点提示 ==========
      "missedPoints": [
        {
          "id": "mp1",
          "title": "公诉转自诉",           // 遗漏点标题（≤8字）
          "description": "未明确案件类型"  // 简短说明（≤8字）
        }
      ],
      
      "referenceAnswer": "参考答案全文...",
      "rubricGuidance": "批改指导说明...",
      "abilityLabel": "法律推理",
      "reviewSource": "ai-v2-phase",
      "reviewProvider": "openai-compatible"
    }
  ]
}
```

---

## 🎨 前端渲染指南

### 1. 答案标注显示（answerMarks）

**需求：在学生答案中高亮显示标注的片段**

```jsx
// 示例代码（React）
function AnswerWithMarks({ answer, answerMarks }) {
  // 方法1：按位置排序标注，依次替换
  const renderAnswer = () => {
    let result = answer;
    let offset = 0;
    
    // 按highlight在原文中的位置排序
    const sortedMarks = answerMarks
      .map(mark => ({
        ...mark,
        index: answer.indexOf(mark.highlight)
      }))
      .filter(mark => mark.index !== -1)
      .sort((a, b) => a.index - b.index);
    
    sortedMarks.forEach(mark => {
      const startIndex = mark.index + offset;
      const endIndex = startIndex + mark.highlight.length;
      
      // 根据status选择样式
      const className = mark.status === 'score' 
        ? 'mark-correct'   // 绿色/对勾
        : 'mark-wrong';    // 红色/打叉
      
      const replacement = `<span class="${className}" data-id="${mark.id}" title="${mark.comment}">
        ${mark.highlight}
        <span class="mark-icon">${mark.status === 'score' ? '✓' : '✗'}</span>
        <span class="mark-score">+${mark.score}</span>
      </span>`;
      
      result = result.slice(0, startIndex) + replacement + result.slice(endIndex);
      offset += replacement.length - mark.highlight.length;
    });
    
    return result;
  };
  
  return <div dangerouslySetInnerHTML={{ __html: renderAnswer() }} />;
}
```

**CSS样式参考：**

```css
/* 得分标注 - 绿色 */
.mark-correct {
  background-color: #d4edda;
  border-bottom: 2px solid #28a745;
  padding: 2px 4px;
  border-radius: 3px;
  position: relative;
}

.mark-correct .mark-icon {
  color: #28a745;
  font-weight: bold;
  margin-left: 4px;
}

.mark-correct .mark-score {
  color: #28a745;
  font-size: 0.9em;
  margin-left: 2px;
}

/* 错误标注 - 红色 */
.mark-wrong {
  background-color: #f8d7da;
  border-bottom: 2px solid #dc3545;
  padding: 2px 4px;
  border-radius: 3px;
  position: relative;
}

.mark-wrong .mark-icon {
  color: #dc3545;
  font-weight: bold;
  margin-left: 4px;
}

/* Tooltip显示comment */
.mark-correct:hover::after,
.mark-wrong:hover::after {
  content: attr(title);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: #333;
  color: white;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  z-index: 1000;
}
```

---

### 2. 总评显示（reviewComment）

```jsx
function ReviewCommentSection({ reviewComment }) {
  return (
    <div className="review-comment">
      <h4>📝 总体评价</h4>
      <p>{reviewComment}</p>
    </div>
  );
}
```

---

### 3. 采分点命中情况（rubricPoints）

```jsx
function RubricPointsList({ rubricPoints }) {
  return (
    <div className="rubric-points">
      <h4>📊 采分点分析</h4>
      <ul>
        {rubricPoints.map(point => (
          <li key={point.id} className={point.hit ? 'hit' : 'miss'}>
            <span className="point-icon">
              {point.hit ? '✓' : '○'}
            </span>
            <span className="point-title">{point.title}</span>
            <span className="point-score">
              {point.awardedScore}/{point.score}分
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**CSS样式：**

```css
.rubric-points ul {
  list-style: none;
  padding: 0;
}

.rubric-points li {
  padding: 8px;
  margin: 4px 0;
  border-radius: 4px;
}

.rubric-points li.hit {
  background-color: #d4edda;
}

.rubric-points li.miss {
  background-color: #f8f9fa;
  opacity: 0.7;
}

.point-icon {
  margin-right: 8px;
  font-weight: bold;
}

.point-score {
  float: right;
  color: #666;
}
```

---

### 4. 遗漏点提示（missedPoints）

```jsx
function MissedPointsList({ missedPoints }) {
  if (missedPoints.length === 0) return null;
  
  return (
    <div className="missed-points">
      <h4>💡 改进建议</h4>
      <ul>
        {missedPoints.map(point => (
          <li key={point.id}>
            <strong>{point.title}：</strong>
            <span>{point.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**CSS样式：**

```css
.missed-points {
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 12px;
  margin-top: 16px;
}

.missed-points h4 {
  color: #856404;
  margin-top: 0;
}

.missed-points ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.missed-points li {
  margin: 4px 0;
  color: #856404;
}
```

---

## 🔄 V1 vs V2 兼容性

### 字段对比

| 字段 | V1 | V2 | 说明 |
|------|----|----|------|
| reviewSource | "ai-v1" | "ai-v2-phase" | 版本标识 |
| answerMarks[].highlight | ✅ 有 | ✅ 有 | 高亮原文 |
| answerMarks[].status | ✅ 有 | ✅ 有 | score/wrong |
| answerMarks[].score | ✅ 有 | ✅ 有 | 得分 |
| answerMarks[].comment | ✅ 有 | ✅ 有 | 评语 |
| rubricPoints | ✅ 有 | ✅ 有 | 采分点 |
| missedPoints | ✅ 有 | ✅ 有 | 遗漏点 |

### 前端兼容代码

```javascript
// 判断是V1还是V2
function getReviewVersion(reviewData) {
  return reviewData.reviewSource === 'ai-v2-phase' ? 'v2' : 'v1';
}

// 兼容处理
function normalizeReviewData(reviewData) {
  const version = getReviewVersion(reviewData);
  
  // V2数据结构已经是标准格式，直接返回
  if (version === 'v2') {
    return reviewData;
  }
  
  // V1数据也是相同格式，直接返回
  return reviewData;
}
```

**结论：V1和V2的数据结构完全兼容，前端无需修改现有代码！**

---

## 🎯 核心渲染逻辑

### 完整组件示例

```jsx
function AIReviewResult({ reviewData }) {
  return (
    <div className="ai-review-result">
      {/* 总分显示 */}
      <div className="score-summary">
        <h3>得分：{reviewData.totalScore}/{reviewData.maxScore}</h3>
      </div>
      
      {/* 逐个小问显示 */}
      {reviewData.subQuestions.map(subQ => (
        <div key={subQ.id} className="sub-question-review">
          <h4>{subQ.title}</h4>
          
          {/* 1. 带标注的学生答案 */}
          <div className="student-answer">
            <h5>学生答案：</h5>
            <AnswerWithMarks 
              answer={subQ.answer} 
              answerMarks={subQ.answerMarks} 
            />
          </div>
          
          {/* 2. 总评 */}
          <ReviewCommentSection reviewComment={subQ.reviewComment} />
          
          {/* 3. 采分点分析 */}
          <RubricPointsList rubricPoints={subQ.rubricPoints} />
          
          {/* 4. 遗漏点提示 */}
          <MissedPointsList missedPoints={subQ.missedPoints} />
          
          {/* 5. 参考答案 */}
          <div className="reference-answer">
            <h5>参考答案：</h5>
            <p>{subQ.referenceAnswer}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## ⚡ 性能优化建议

### 1. 大文本渲染优化

```javascript
// 使用虚拟滚动处理超长答案
import { Virtuoso } from 'react-virtuoso';

function LongAnswerWithMarks({ answer, answerMarks }) {
  // 将答案按段落分割
  const paragraphs = answer.split('\n').filter(p => p.trim());
  
  return (
    <Virtuoso
      style={{ height: '400px' }}
      totalCount={paragraphs.length}
      itemContent={index => (
        <p>{paragraphs[index]}</p>
      )}
    />
  );
}
```

### 2. 标注重叠处理

```javascript
// 检测标注是否重叠
function detectOverlap(marks) {
  const overlaps = [];
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      const a = marks[i];
      const b = marks[j];
      if (a.index < b.index + b.highlight.length && 
          b.index < a.index + a.highlight.length) {
        overlaps.push([a, b]);
      }
    }
  }
  return overlaps;
}
```

---

## 🐛 常见问题处理

### 1. highlight字段为空

```javascript
// 某些标注可能没有highlight（如未作答）
function safeRenderMark(mark) {
  if (!mark.highlight || mark.highlight === '') {
    return null; // 不渲染
  }
  // 正常渲染
}
```

### 2. highlight在答案中找不到

```javascript
// 有时AI返回的highlight可能与原文略有差异
function fuzzyFindHighlight(answer, highlight) {
  // 精确匹配
  let index = answer.indexOf(highlight);
  if (index !== -1) return index;
  
  // 模糊匹配（去除空格和标点）
  const normalize = str => str.replace(/[\s　,.，。！？；]/g, '');
  const normalizedAnswer = normalize(answer);
  const normalizedHighlight = normalize(highlight);
  
  index = normalizedAnswer.indexOf(normalizedHighlight);
  if (index !== -1) {
    // 映射回原文位置
    return mapNormalizedIndex(answer, index);
  }
  
  return -1; // 找不到
}
```

### 3. 特殊字符处理

```javascript
// highlight中可能包含【】替代内层引号
function cleanHighlight(highlight) {
  return highlight
    .replace(/【/g, '"')
    .replace(/】/g, '"');
}
```

---

## 📝 测试数据示例

### 完整的测试JSON

```json
{
  "source": "ai",
  "reviewSource": "ai-v2-phase",
  "totalScore": 4,
  "maxScore": 5,
  "subQuestions": [
    {
      "id": "sub_1",
      "title": "判断陈某的自诉是否属于法定自诉案件范围？",
      "answer": "陈某提起的自诉属于法定自诉案件范围。根据刑事诉讼法第210条规定，公安机关或人民检察院不予追究被告人刑事责任的案件，被害人有证据证明的，可以向人民法院提起自诉。在本案中，公安机关认为陈某情节显著轻微，不予立案，陈某有监控录像、伤情鉴定等证据，符合刑事诉讼法210条关于自诉案件的范围。",
      "score": 4,
      "maxScore": 5,
      "reviewComment": "结论正确但将刘某误写为陈某",
      "answerMarks": [
        {
          "id": "m1",
          "highlight": "陈某提起的自诉属于法定自诉案件范围",
          "status": "score",
          "score": 2,
          "comment": "结论正确"
        },
        {
          "id": "m2",
          "highlight": "陈某有监控录像、伤情鉴定等证据",
          "status": "score",
          "score": 1,
          "comment": "有证据"
        },
        {
          "id": "m3",
          "highlight": "公安机关认为陈某情节显著轻微",
          "status": "wrong",
          "score": 0,
          "comment": "主体写反"
        }
      ],
      "rubricPoints": [
        {"id": "r1", "title": "结论正确", "score": 2, "hit": true, "awardedScore": 2},
        {"id": "r2", "title": "有证据证明", "score": 1, "hit": true, "awardedScore": 1},
        {"id": "r3", "title": "公安不予追究", "score": 1, "hit": true, "awardedScore": 1},
        {"id": "r4", "title": "说明公诉转自诉", "score": 1, "hit": false, "awardedScore": 0}
      ],
      "missedPoints": [
        {"id": "mp1", "title": "公诉转自诉", "description": "未明确案件类型"}
      ],
      "referenceAnswer": "属于法定自诉案件范围。理由：根据刑事诉讼法规定，本案属于第三类公诉转自诉案件，被害人有证据证明被告人侵犯自己的人身、财产权利应当依法追究刑事责任，但公安机关不予追究的，可以向法院提起自诉。",
      "reviewSource": "ai-v2-phase",
      "reviewProvider": "openai-compatible"
    }
  ]
}
```

---

## 🚀 快速开始

### 1. 后端环境变量配置

```bash
# .env
AI_REVIEW_VERSION=v2
```

### 2. 前端无需修改

V2的数据结构与V1完全兼容，现有前端代码可以直接使用V2的批改结果。

### 3. 验证集成

```javascript
// 调用批改接口
const response = await fetch('/api/mock-exams/123/ai-review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});

const result = await response.json();

// 检查是否是V2
console.log('Review source:', result.reviewSource); // 应该是 "ai-v2-phase"

// 渲染结果
<AIReviewResult reviewData={result} />
```

---

## 📞 技术支持

如有问题，请检查：
1. `reviewSource` 字段是否为 `"ai-v2-phase"`
2. 所有 `answerMarks` 是否都有 `highlight` 字段
3. 控制台是否有JSON解析错误

---

**版本：** V2.0  
**更新时间：** 2024-06-03  
**兼容性：** 与V1完全兼容
