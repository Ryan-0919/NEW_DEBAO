ALTER TABLE `MockExamRecord`
  MODIFY `reviewWorkflowStatus` ENUM('not_required', 'ai_pending', 'ai_processing', 'manual_pending', 'published', 'returned_for_redo') NOT NULL DEFAULT 'not_required';
