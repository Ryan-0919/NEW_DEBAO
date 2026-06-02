-- ===================================================================
-- 修复"AI重批后显示旧数据"问题的SQL脚本
-- ===================================================================
-- 问题：重新批改后，publishedReviewJson 没有被清空，导致显示旧批改数据
-- 解决：清空所有未发布状态记录的 publishedReviewJson
-- ===================================================================

-- 第一步：检查受影响的记录数量
SELECT
  '受影响的记录' as category,
  COUNT(DISTINCT r.id) as record_count,
  COUNT(a.id) as answer_count
FROM mockExamRecord r
INNER JOIN mockExamAnswer a ON a.recordId = r.id
WHERE r.status = 'submitted'
  AND r.publishedAt IS NULL  -- 记录未发布
  AND a.publishedReviewJson IS NOT NULL  -- 但答案有发布快照
UNION ALL
SELECT
  '总批改记录' as category,
  COUNT(DISTINCT r.id) as record_count,
  COUNT(a.id) as answer_count
FROM mockExamRecord r
INNER JOIN mockExamAnswer a ON a.recordId = r.id
WHERE r.status = 'submitted';

-- 第二步：查看具体受影响的记录（前10条）
SELECT
  r.id as record_id,
  r.userId as user_id,
  r.reviewWorkflowStatus,
  r.publishedAt,
  r.updatedAt,
  COUNT(a.id) as total_answers,
  SUM(CASE WHEN a.publishedReviewJson IS NOT NULL THEN 1 ELSE 0 END) as published_snapshot_count
FROM mockExamRecord r
INNER JOIN mockExamAnswer a ON a.recordId = r.id
WHERE r.status = 'submitted'
  AND r.publishedAt IS NULL
  AND a.publishedReviewJson IS NOT NULL
GROUP BY r.id
ORDER BY r.updatedAt DESC
LIMIT 10;

-- 第三步：【谨慎执行】清空这些记录的 publishedReviewJson
-- 取消下面的注释来执行清理
/*
UPDATE mockExamAnswer
SET
  publishedReviewJson = NULL,
  publishedScore = NULL
WHERE recordId IN (
  SELECT DISTINCT r.id
  FROM mockExamRecord r
  WHERE r.status = 'submitted'
    AND r.publishedAt IS NULL
    AND EXISTS (
      SELECT 1
      FROM mockExamAnswer a
      WHERE a.recordId = r.id
        AND a.publishedReviewJson IS NOT NULL
    )
);
*/

-- 第四步：验证修复结果（应该返回0行）
SELECT
  r.id as record_id,
  r.reviewWorkflowStatus,
  COUNT(a.id) as total_answers,
  SUM(CASE WHEN a.publishedReviewJson IS NOT NULL THEN 1 ELSE 0 END) as published_snapshot_count
FROM mockExamRecord r
INNER JOIN mockExamAnswer a ON a.recordId = r.id
WHERE r.status = 'submitted'
  AND r.publishedAt IS NULL
  AND a.publishedReviewJson IS NOT NULL
GROUP BY r.id;

-- ===================================================================
-- 额外检查：查看所有批改记录的状态分布
-- ===================================================================
SELECT
  r.reviewWorkflowStatus,
  COUNT(DISTINCT r.id) as record_count,
  SUM(CASE WHEN r.publishedAt IS NOT NULL THEN 1 ELSE 0 END) as published_count,
  SUM(CASE WHEN EXISTS (
    SELECT 1 FROM mockExamAnswer a
    WHERE a.recordId = r.id AND a.publishedReviewJson IS NOT NULL
  ) THEN 1 ELSE 0 END) as has_snapshot_count
FROM mockExamRecord r
WHERE r.status = 'submitted'
GROUP BY r.reviewWorkflowStatus
ORDER BY r.reviewWorkflowStatus;
