const uniqueIds = (values = []) => [...new Set(values.map((value) => `${value ?? ""}`.trim()).filter(Boolean))];

export const recomputeBookQuestionBankProgress = async (client, bookIds = []) => {
  const targetBookIds = uniqueIds(bookIds);
  if (targetBookIds.length === 0) return;

  const [progresses, states] = await Promise.all([
    client.userBookQuestionBankProgress.findMany({
      where: { bookId: { in: targetBookIds } },
      select: { id: true, userId: true, bookId: true },
    }),
    client.userBookQuestionBankItemState.findMany({
      where: { bookId: { in: targetBookIds } },
      select: {
        userId: true,
        bookId: true,
        isAnswered: true,
        hasViewedAnswer: true,
        isMastered: true,
        isRedoMarked: true,
        updatedAt: true,
        bookItem: {
          select: {
            id: true,
            subjectId: true,
            status: true,
            bookQuestionLibraryItemId: true,
          },
        },
      },
    }),
  ]);

  const countsByUserBook = new Map();
  const keyOf = (userId, bookId) => `${userId}:${bookId}`;

  for (const state of states) {
    if (!state.bookItem?.status || !state.bookItem?.bookQuestionLibraryItemId) continue;
    const key = keyOf(state.userId, state.bookId);
    const current = countsByUserBook.get(key) ?? {
      userId: state.userId,
      bookId: state.bookId,
      answeredCount: 0,
      viewedAnswerCount: 0,
      masteredCount: 0,
      redoCount: 0,
      lastPracticedAt: null,
      lastSubjectId: null,
      lastBookItemId: null,
    };

    if (state.isAnswered) current.answeredCount += 1;
    if (state.hasViewedAnswer) current.viewedAnswerCount += 1;
    if (state.isMastered) current.masteredCount += 1;
    if (state.isRedoMarked) current.redoCount += 1;

    const currentTime = current.lastPracticedAt ? current.lastPracticedAt.getTime() : 0;
    const nextTime = state.updatedAt ? state.updatedAt.getTime() : 0;
    if (nextTime >= currentTime) {
      current.lastPracticedAt = state.updatedAt;
      current.lastSubjectId = state.bookItem.subjectId;
      current.lastBookItemId = state.bookItem.id;
    }

    countsByUserBook.set(key, current);
  }

  const existingKeys = new Set(progresses.map((progress) => keyOf(progress.userId, progress.bookId)));
  const updates = progresses.map((progress) => {
    const counts = countsByUserBook.get(keyOf(progress.userId, progress.bookId));
    return client.userBookQuestionBankProgress.update({
      where: { id: progress.id },
      data: {
        answeredCount: counts?.answeredCount ?? 0,
        viewedAnswerCount: counts?.viewedAnswerCount ?? 0,
        masteredCount: counts?.masteredCount ?? 0,
        redoCount: counts?.redoCount ?? 0,
        lastPracticedAt: counts?.lastPracticedAt ?? null,
        lastSubjectId: counts?.lastSubjectId ?? null,
        lastBookItemId: counts?.lastBookItemId ?? null,
      },
    });
  });

  const creates = [...countsByUserBook.values()]
    .filter((counts) => !existingKeys.has(keyOf(counts.userId, counts.bookId)))
    .map((counts) =>
      client.userBookQuestionBankProgress.create({
        data: {
          userId: counts.userId,
          bookId: counts.bookId,
          answeredCount: counts.answeredCount,
          viewedAnswerCount: counts.viewedAnswerCount,
          masteredCount: counts.masteredCount,
          redoCount: counts.redoCount,
          lastPracticedAt: counts.lastPracticedAt,
          lastSubjectId: counts.lastSubjectId,
          lastBookItemId: counts.lastBookItemId,
        },
      }),
    );

  await Promise.all([...updates, ...creates]);
};
