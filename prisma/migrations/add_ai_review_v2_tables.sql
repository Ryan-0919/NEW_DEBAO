-- AI review V2 independent tables.
-- This migration does not modify existing mock exam tables, so V1 review remains isolated.

CREATE TABLE IF NOT EXISTS ai_review_strategies (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT false,
  grading_principles TEXT COMMENT 'grading principles',
  error_emphasis TEXT COMMENT 'error mark emphasis',
  comment_template TEXT COMMENT 'comment template',
  model VARCHAR(50) DEFAULT 'claude-sonnet-4-6',
  temperature DECIMAL(3,2) DEFAULT 0.5,
  max_tokens INT DEFAULT 8000,
  timeout_ms INT DEFAULT 120000,
  require_error_marks BOOLEAN DEFAULT true,
  min_error_marks_count INT DEFAULT 1,
  min_coverage_rate DECIMAL(3,2) DEFAULT 0.30,
  strict_validation BOOLEAN DEFAULT true,
  created_by VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  comment TEXT,
  UNIQUE KEY uk_name_version (name, version),
  INDEX idx_active (is_active),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI review strategy config';

CREATE TABLE IF NOT EXISTS ai_review_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  record_id VARCHAR(50) NOT NULL,
  question_id VARCHAR(50) NOT NULL,
  sub_question_id VARCHAR(50),
  strategy_id INT,
  strategy_name VARCHAR(100),
  strategy_version VARCHAR(20),
  model VARCHAR(50),
  temperature DECIMAL(3,2),
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  latency_ms INT,
  status VARCHAR(50),
  retry_count INT DEFAULT 0,
  error_message TEXT,
  validation_passed BOOLEAN,
  validation_errors JSON,
  score INT,
  max_score INT,
  positive_marks_count INT,
  error_marks_count INT,
  neutral_marks_count INT,
  coverage_rate DECIMAL(4,3),
  comment_length INT,
  started_at DATETIME(3),
  completed_at DATETIME(3),
  raw_prompt MEDIUMTEXT,
  raw_response MEDIUMTEXT,
  final_result JSON,
  INDEX idx_record (record_id),
  INDEX idx_question (question_id),
  INDEX idx_status (status),
  INDEX idx_started_at (started_at),
  INDEX idx_strategy (strategy_id),
  CONSTRAINT fk_ai_review_logs_strategy
    FOREIGN KEY (strategy_id) REFERENCES ai_review_strategies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI review logs';

INSERT INTO ai_review_strategies (
  name,
  version,
  is_active,
  grading_principles,
  error_emphasis,
  model,
  temperature,
  max_tokens,
  require_error_marks,
  min_error_marks_count,
  min_coverage_rate,
  created_by,
  comment
) VALUES (
  'standard-review-v2',
  'v2.0',
  true,
  'Grade strictly by rubric points and mark both awarded points and errors.',
  'Prioritize wrong legal subject, relationship, concept, fact finding, opposite conclusion, and logical mistakes.',
  'claude-sonnet-4-6',
  0.5,
  8000,
  true,
  1,
  0.30,
  'system',
  'Default AI review V2 strategy.'
) ON DUPLICATE KEY UPDATE
  is_active = VALUES(is_active),
  updated_at = CURRENT_TIMESTAMP;

SELECT
  'ai_review_v2_tables_ready' AS message,
  (SELECT COUNT(*) FROM ai_review_strategies WHERE is_active = true) AS active_strategy_count,
  (SELECT COUNT(*) FROM ai_review_logs) AS log_count;
