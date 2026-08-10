const normalizeText = (value = "") => `${value ?? ""}`.trim();

export const isPartTimeReviewerRole = (role = "") => normalizeText(role) === "part_time_reviewer";

export const canManageReviewAssignments = (role = "") =>
  ["super_admin", "operations_admin", "review_admin"].includes(normalizeText(role));

export const canAssignToPartTimeReviewer = (record) =>
  normalizeText(record?.reviewWorkflowStatus) === "manual_pending" && !normalizeText(record?.publishedAt);

export const canReassignReviewRecord = (record) => !normalizeText(record?.publishedAt);

export const canUnassignReviewRecord = (record) =>
  !normalizeText(record?.publishedAt) && normalizeText(record?.reviewWorkflowStatus) === "manual_pending" && normalizeText(record?.assignedReviewerId) !== "";

export const canReviewerAccessAssignedRecord = ({ adminRole = "", adminId = "", assignedReviewerId = "" }) => {
  if (!isPartTimeReviewerRole(adminRole)) {
    return true;
  }
  return normalizeText(adminId) !== "" && normalizeText(adminId) === normalizeText(assignedReviewerId);
};

export const summarizeReviewerStats = ({ reviewerId = "", currentTime = new Date(), selectedDate = currentTime, records = [] }) => {
  const normalizedReviewerId = normalizeText(reviewerId);
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);
  const selected = selectedDate instanceof Date ? selectedDate : new Date(selectedDate);
  const effectiveSelectedDate = Number.isFinite(selected.getTime()) ? selected : now;
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const startOfSelectedDate = new Date(effectiveSelectedDate);
  startOfSelectedDate.setHours(0, 0, 0, 0);
  const endOfSelectedDate = new Date(startOfSelectedDate);
  endOfSelectedDate.setDate(endOfSelectedDate.getDate() + 1);
  const startOfSelectedMonth = new Date(effectiveSelectedDate);
  startOfSelectedMonth.setDate(1);
  startOfSelectedMonth.setHours(0, 0, 0, 0);
  const endOfSelectedMonth = new Date(startOfSelectedMonth);
  endOfSelectedMonth.setMonth(endOfSelectedMonth.getMonth() + 1);

  let lastHourCount = 0;
  let todayCount = 0;
  let monthCount = 0;
  let selectedDateCount = 0;
  let selectedMonthCount = 0;
  let totalCount = 0;
  let assignedPendingCount = 0;

  for (const record of Array.isArray(records) ? records : []) {
    const assignedReviewerId = normalizeText(record?.assignedReviewerId);
    const publishedReviewerId = normalizeText(record?.publishedReviewerId);
    const workflowStatus = normalizeText(record?.reviewWorkflowStatus);
    const publishedAtText = normalizeText(record?.publishedAt);
    const publishedAt = publishedAtText ? new Date(publishedAtText) : null;
    const publishedAtMs = publishedAt && Number.isFinite(publishedAt.getTime()) ? publishedAt.getTime() : null;

    if (publishedReviewerId === normalizedReviewerId && publishedAtMs !== null) {
      totalCount += 1;
      if (publishedAtMs >= startOfToday.getTime() && publishedAtMs <= now.getTime()) {
        todayCount += 1;
      }
      if (publishedAtMs >= startOfMonth.getTime() && publishedAtMs <= now.getTime()) {
        monthCount += 1;
      }
      if (publishedAtMs >= startOfSelectedDate.getTime() && publishedAtMs < endOfSelectedDate.getTime()) {
        selectedDateCount += 1;
      }
      if (publishedAtMs >= startOfSelectedMonth.getTime() && publishedAtMs < endOfSelectedMonth.getTime()) {
        selectedMonthCount += 1;
      }
      if (publishedAtMs >= oneHourAgo.getTime() && publishedAtMs <= now.getTime()) {
        lastHourCount += 1;
      }
    }

    if (
      assignedReviewerId === normalizedReviewerId &&
      !publishedAtText &&
      workflowStatus !== "published" &&
      workflowStatus !== "returned_for_redo"
    ) {
      assignedPendingCount += 1;
    }
  }

  return {
    lastHourCount,
    todayCount,
    monthCount,
    selectedDateCount,
    selectedMonthCount,
    totalCount,
    assignedPendingCount,
  };
};
