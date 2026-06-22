import { prisma } from "../server/lib/prisma.js";

const OBJECTIVE_TYPES = new Set(["single_choice", "multiple_choice", "uncertain_choice"]);
const getObjectiveScore = (type) => (type === "single_choice" ? 1 : 2);
const isDryRun = process.argv.includes("--dry-run");
const shouldRecalculateRecords = !process.argv.includes("--skip-records");
const runInChunks = async (operations, chunkSize = 50) => {
  for (let index = 0; index < operations.length; index += chunkSize) {
    await prisma.$transaction(operations.slice(index, index + chunkSize));
  }
};

const toJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeAnswerKeys = (value = []) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map((item) => `${item ?? ""}`.trim().toUpperCase()).filter(Boolean))).sort();

const isSameAnswer = (left = [], right = []) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const getAnswerKeysFromAnswerJson = (value) => {
  const parsed = (() => {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  })();

  if (Array.isArray(parsed)) return normalizeAnswerKeys(parsed);
  return normalizeAnswerKeys(parsed?.answerKeys ?? parsed?.selectedKeys ?? parsed?.selectedOptions ?? parsed?.keys ?? []);
};

const updateQuestionBankItemScores = async () => {
  const items = await prisma.questionBankItem.findMany({
    where: {
      type: { in: Array.from(OBJECTIVE_TYPES) },
      folder: { paperType: "objective" },
    },
    select: { id: true, type: true, score: true },
  });
  const wrongItems = items.filter((item) => Number(item.score ?? 0) !== getObjectiveScore(item.type));
  if (!isDryRun && wrongItems.length > 0) {
    await runInChunks(
      wrongItems.map((item) =>
        prisma.questionBankItem.update({
          where: { id: item.id },
          data: { score: getObjectiveScore(item.type) },
        }),
      ),
    );
  }
  return wrongItems.length;
};

const updateMockExamQuestionScores = async () => {
  const questions = await prisma.mockExamQuestion.findMany({
    where: {
      type: { in: Array.from(OBJECTIVE_TYPES) },
      paper: { paperType: "objective" },
    },
    select: { id: true, type: true, score: true },
  });
  const wrongQuestions = questions.filter((question) => Number(question.score ?? 0) !== getObjectiveScore(question.type));
  if (!isDryRun && wrongQuestions.length > 0) {
    await runInChunks(
      wrongQuestions.map((question) =>
        prisma.mockExamQuestion.update({
          where: { id: question.id },
          data: { score: getObjectiveScore(question.type) },
        }),
      ),
    );
  }
  return wrongQuestions.length;
};

const syncObjectivePaperTotals = async () => {
  const papers = await prisma.mockExamPaper.findMany({
    where: { paperType: "objective" },
    include: {
      questions: {
        where: { isActive: true },
        select: { id: true, score: true },
      },
    },
  });

  const changedPapers = papers.filter((paper) => {
    const questionCount = paper.questions.length;
    const totalScore = paper.questions.reduce((sum, question) => sum + Number(question.score ?? 0), 0);
    return Number(paper.questionCount ?? 0) !== questionCount || Number(paper.totalScore ?? 0) !== totalScore;
  });

  if (!isDryRun && changedPapers.length > 0) {
    await runInChunks(
      changedPapers.map((paper) =>
        prisma.mockExamPaper.update({
          where: { id: paper.id },
          data: {
            questionCount: paper.questions.length,
            totalScore: paper.questions.reduce((sum, question) => sum + Number(question.score ?? 0), 0),
          },
        }),
      ),
    );
  }

  return changedPapers.length;
};

const recalculateObjectiveRecords = async () => {
  if (!shouldRecalculateRecords) return { records: 0, answers: 0 };

  const records = await prisma.mockExamRecord.findMany({
    where: {
      status: "submitted",
      paper: { paperType: "objective" },
    },
    include: {
      paper: {
        include: {
          questions: {
            where: { isActive: true },
            select: { id: true, type: true, score: true, correctAnswerJson: true },
          },
        },
      },
      answers: {
        select: { id: true, questionId: true, answerJson: true, score: true, isCorrect: true },
      },
    },
  });

  const recordUpdates = [];
  const answerUpdates = [];

  for (const record of records) {
    let totalScore = 0;
    let correctCount = 0;
    let answeredCount = 0;
    const answerMap = new Map(record.answers.map((answer) => [answer.questionId, answer]));

    for (const question of record.paper?.questions ?? []) {
      if (!OBJECTIVE_TYPES.has(question.type)) continue;
      const answer = answerMap.get(question.id);
      const userAnswerKeys = getAnswerKeysFromAnswerJson(answer?.answerJson);
      const correctAnswerKeys = normalizeAnswerKeys(toJsonArray(question.correctAnswerJson));
      const hasAnswered = userAnswerKeys.length > 0;
      const isCorrect = hasAnswered && isSameAnswer(userAnswerKeys, correctAnswerKeys);
      const score = isCorrect ? getObjectiveScore(question.type) : 0;
      if (hasAnswered) answeredCount += 1;
      if (isCorrect) {
        correctCount += 1;
        totalScore += score;
      }
      if (answer && (Number(answer.score ?? 0) !== score || answer.isCorrect !== isCorrect)) {
        answerUpdates.push({ id: answer.id, score, isCorrect });
      }
    }

    if (
      Number(record.totalScore ?? 0) !== totalScore ||
      Number(record.correctCount ?? 0) !== correctCount ||
      Number(record.answeredCount ?? 0) !== answeredCount
    ) {
      recordUpdates.push({ id: record.id, totalScore, correctCount, answeredCount });
    }
  }

  if (!isDryRun) {
    const operations = [
      ...answerUpdates.map((item) =>
        prisma.mockExamAnswer.update({
          where: { id: item.id },
          data: { score: item.score, isCorrect: item.isCorrect },
        }),
      ),
      ...recordUpdates.map((item) =>
        prisma.mockExamRecord.update({
          where: { id: item.id },
          data: { totalScore: item.totalScore, correctCount: item.correctCount, answeredCount: item.answeredCount },
        }),
      ),
    ];
    await runInChunks(operations);
  }

  return { records: recordUpdates.length, answers: answerUpdates.length };
};

const main = async () => {
  console.log(`${isDryRun ? "[dry-run] " : ""}开始修正客观机考分值：单选 1 分，多选/不定项 2 分`);
  const questionBankItems = await updateQuestionBankItemScores();
  const mockExamQuestions = await updateMockExamQuestionScores();
  const papers = await syncObjectivePaperTotals();
  const records = await recalculateObjectiveRecords();

  console.log(
    JSON.stringify(
      {
        mode: isDryRun ? "dry-run" : "execute",
        questionBankItems,
        mockExamQuestions,
        papers,
        recalculatedRecords: records.records,
        recalculatedAnswers: records.answers,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error("客观机考分值修正失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
