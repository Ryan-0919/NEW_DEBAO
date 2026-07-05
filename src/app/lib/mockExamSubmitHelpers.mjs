export const shouldStartMockExamSubmit = ({ hasActiveRecord, submitting, submittingRefCurrent }) =>
  Boolean(hasActiveRecord) && !submitting && !submittingRefCurrent;

export const trackMockExamSaveTask = ({ taskMap, key, text, run }) => {
  const existing = taskMap[key];
  if (existing && existing.text === text) {
    return existing.promise;
  }

  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      if (taskMap[key]?.promise === promise) {
        delete taskMap[key];
      }
    });

  taskMap[key] = { text, promise };
  return promise;
};

export const waitForMockExamSaveTasks = async (taskMap) => {
  const tasks = Object.values(taskMap ?? {}).map((item) => item?.promise).filter(Boolean);
  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
};
