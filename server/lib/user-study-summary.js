const toCount = (value) => Math.max(0, Number(value ?? 0) || 0);

const getAnswerProgressText = (record) =>
  `作答 ${toCount(record?.answeredCount)}/${toCount(record?.questionCount)}`;

const isSubjectiveReviewPublished = (record) =>
  `${record?.reviewWorkflowStatus ?? ""}`.trim() === "published" || Boolean(record?.publishedAt);

export const getMockExamActivityDetail = (record) => {
  const answerProgress = getAnswerProgressText(record);
  if (record?.status !== "submitted") return `已${answerProgress}`;

  const isSubjective = record?.paper?.paperType === "subjective";
  if (isSubjective && !isSubjectiveReviewPublished(record)) {
    return `待老师批改 / ${answerProgress}`;
  }

  return `得分 ${toCount(record?.totalScore)} / ${answerProgress}`;
};
