const normalizeOptionalText = (value) => {
  const text = `${value ?? ""}`.trim();
  return text || null;
};

const normalizeDurationSeconds = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export const getQuestionBankItemAudioPayload = (item = {}) => ({
  lessonAudioUrl: normalizeOptionalText(item.lessonAudioUrl),
  lessonAudioObjectKey: normalizeOptionalText(item.lessonAudioObjectKey),
  lessonAudioDurationSeconds: normalizeDurationSeconds(item.lessonAudioDurationSeconds),
});

export const hasQuestionBankItemAudioChanged = (beforeItem = {}, afterItem = {}) => {
  const before = getQuestionBankItemAudioPayload(beforeItem);
  const after = getQuestionBankItemAudioPayload(afterItem);
  return (
    before.lessonAudioUrl !== after.lessonAudioUrl ||
    before.lessonAudioObjectKey !== after.lessonAudioObjectKey ||
    before.lessonAudioDurationSeconds !== after.lessonAudioDurationSeconds
  );
};

export const syncReferencedMockExamQuestionAudio = async (db, { beforeItem = null, sourceItem = null, paperType = "" } = {}) => {
  if (!db?.mockExamQuestion || !sourceItem?.id) {
    return { count: 0, skipped: true, reason: "missing_source_item" };
  }

  if (paperType !== "subjective") {
    return { count: 0, skipped: true, reason: "unsupported_paper_type" };
  }

  if (beforeItem && !hasQuestionBankItemAudioChanged(beforeItem, sourceItem)) {
    return { count: 0, skipped: true, reason: "audio_unchanged" };
  }

  const result = await db.mockExamQuestion.updateMany({
    where: {
      sourceBankItemId: sourceItem.id,
      isActive: true,
      type: "subjective_case",
    },
    data: getQuestionBankItemAudioPayload(sourceItem),
  });

  return { count: Number(result?.count ?? 0) || 0 };
};
