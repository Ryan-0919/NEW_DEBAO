ALTER TABLE ai_review_strategies
  ADD COLUMN system_prompt TEXT NULL AFTER is_active,
  ADD COLUMN phase1_output_requirements TEXT NULL AFTER comment_template,
  ADD COLUMN phase2_output_requirements TEXT NULL AFTER phase1_output_requirements;
