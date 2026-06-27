const OBJECTIVE_GROUP_ORDER = ["single_choice", "multiple_choice", "uncertain_choice"];

const DEFAULT_OBJECTIVE_LABELS = {
  single_choice: "单项选择题",
  multiple_choice: "多项选择题",
  uncertain_choice: "不定项选择题",
};

const isSubjectiveQuestion = (question) => question?.type === "subjective_case";

const buildSequentialGroups = (questions) => {
  const groups = [];

  for (const question of questions) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === question.sectionLabel) {
      lastGroup.questions.push(question);
      continue;
    }

    groups.push({
      key: `${question.type}-${question.sectionLabel}-${groups.length}`,
      label: question.sectionLabel,
      description: question.sectionDescription,
      questions: [question],
    });
  }

  return groups;
};

export const buildStableQuestionGroups = (questions) => {
  if (!Array.isArray(questions) || questions.length === 0) {
    return [];
  }

  if (questions.some(isSubjectiveQuestion)) {
    return buildSequentialGroups(questions);
  }

  const groupedQuestions = new Map(OBJECTIVE_GROUP_ORDER.map((type) => [type, []]));

  for (const question of questions) {
    const bucket = groupedQuestions.get(question.type);
    if (bucket) {
      bucket.push(question);
    }
  }

  return OBJECTIVE_GROUP_ORDER.flatMap((type) => {
    const groupQuestions = groupedQuestions.get(type) ?? [];
    if (groupQuestions.length === 0) {
      return [];
    }

    const firstQuestion = groupQuestions[0];
    return [{
      key: type,
      label: firstQuestion.sectionLabel || DEFAULT_OBJECTIVE_LABELS[type],
      description: firstQuestion.sectionDescription || "",
      questions: groupQuestions,
    }];
  });
};
