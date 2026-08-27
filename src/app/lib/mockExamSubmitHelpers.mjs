export const shouldStartMockExamSubmit = ({ hasActiveRecord, submitting, submittingRefCurrent }) =>
  Boolean(hasActiveRecord) && !submitting && !submittingRefCurrent;

export const trackMockExamSaveTask = ({ taskMap, key, text, run }) => {
  const existing = taskMap[key];
  if (existing && existing.text === text) {
    return existing.promise;
  }

  const task = { text, promise: null, startedAt: Date.now() };
  const promise = (existing?.promise ? existing.promise.catch(() => undefined) : Promise.resolve())
    .then(() => {
      // A newer edit may have replaced this task while it was waiting. Skip
      // stale payloads so the latest text is the only one sent to the server.
      if (taskMap[key] !== task) return undefined;
      return run();
    })
    .finally(() => {
      if (taskMap[key]?.promise === promise) {
        delete taskMap[key];
      }
    });

  task.promise = promise;
  taskMap[key] = task;
  return promise;
};

export const waitForMockExamSaveTasks = async (taskMap, options = {}) => {
  const entries = Object.entries(taskMap ?? {})
    .map(([key, item]) => ({ key, promise: item?.promise }))
    .filter((item) => item.promise);
  if (entries.length === 0) return true;

  const waitForAll = Promise.allSettled(entries.map((item) => item.promise)).then(() => true);
  const timeoutMs = Number(options.timeoutMs ?? 0);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return waitForAll;
  }

  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(false), timeoutMs);
  });

  const completed = await Promise.race([waitForAll, timeout]);
  if (timeoutId) clearTimeout(timeoutId);

  if (!completed && options.clearOnTimeout) {
    for (const entry of entries) {
      if (taskMap?.[entry.key]?.promise === entry.promise) {
        delete taskMap[entry.key];
      }
    }
  }

  return completed;
};
