ALTER TABLE `MockExamRecord`
  ADD COLUMN `assignedReviewerId` VARCHAR(191) NULL,
  ADD COLUMN `assignedReviewerName` VARCHAR(100) NULL,
  ADD COLUMN `assignedAt` DATETIME(3) NULL,
  ADD COLUMN `assignedByAdminId` VARCHAR(191) NULL,
  ADD COLUMN `assignedByAdminName` VARCHAR(100) NULL,
  ADD COLUMN `publishedReviewerId` VARCHAR(191) NULL,
  ADD COLUMN `publishedReviewerName` VARCHAR(100) NULL;

CREATE INDEX `MockExamRecord_assignedReviewerId_reviewWorkflowStatus_submittedAt_idx`
  ON `MockExamRecord` (`assignedReviewerId`, `reviewWorkflowStatus`, `submittedAt`);

CREATE INDEX `MockExamRecord_publishedReviewerId_publishedAt_idx`
  ON `MockExamRecord` (`publishedReviewerId`, `publishedAt`);
