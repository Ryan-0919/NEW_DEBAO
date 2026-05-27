import * as XLSX from "xlsx";
import { normalizeDisplayText } from "./text.js";

export class QuestionImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuestionImportError";
    this.statusCode = 400;
  }
}

const OPTION_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const SPREADSHEET_FILE_RE = /\.(xlsx|xls|csv)$/i;

const normalizeHeader = (value) =>
  `${value ?? ""}`
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();

const normalizeCellText = (value) => normalizeDisplayText(value ?? "").trim();

const normalizeRow = (row = {}) => {
  const map = new Map();
  Object.entries(row).forEach(([key, value]) => {
    const normalizedKey = normalizeHeader(key);
    if (normalizedKey) map.set(normalizedKey, normalizeCellText(value));
  });
  return map;
};

const pick = (rowMap, aliases) => {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (rowMap.has(key)) return rowMap.get(key) ?? "";
  }
  return "";
};

const splitList = (value) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : value ? `${value}`.split(/[,\n，、；;]/) : [])
        .map((item) => normalizeCellText(item))
        .filter(Boolean),
    ),
  ];

const parseJsonText = (value) => {
  const text = `${value ?? ""}`.replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new QuestionImportError("导入文件不是有效 JSON，请检查格式");
  }
};

const parseJsonField = (value, fallback) => {
  const text = normalizeCellText(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const normalizeQuestionType = (value) => {
  const text = normalizeCellText(value);
  const normalized = normalizeHeader(text);
  const map = {
    singlechoice: "single_choice",
    single_choice: "single_choice",
    单选: "single_choice",
    单项选择: "single_choice",
    单项选择题: "single_choice",
    multiplechoice: "multiple_choice",
    multiple_choice: "multiple_choice",
    多选: "multiple_choice",
    多项选择: "multiple_choice",
    多项选择题: "multiple_choice",
    uncertainchoice: "uncertain_choice",
    uncertain_choice: "uncertain_choice",
    不定项: "uncertain_choice",
    不定项选择: "uncertain_choice",
    不定项选择题: "uncertain_choice",
    subjectivecase: "subjective_case",
    subjective_case: "subjective_case",
    主观: "subjective_case",
    主观题: "subjective_case",
    主观案例: "subjective_case",
    主观案例题: "subjective_case",
    案例分析: "subjective_case",
    案例分析题: "subjective_case",
  };
  return map[normalized] ?? text;
};

const normalizeDifficulty = (value) => {
  const text = normalizeCellText(value);
  if (!text) return "";
  const normalized = normalizeHeader(text);
  if (normalized === "基础" || normalized === "简单") return 1;
  if (normalized === "标准" || normalized === "中等" || normalized === "普通") return 2;
  if (normalized === "较难" || normalized === "困难" || normalized === "难") return 3;
  return text;
};

const parseOptions = (rowMap) => {
  const optionsJson = parseJsonField(pick(rowMap, ["options", "optionsJson", "选项JSON", "选项json"]), null);
  if (Array.isArray(optionsJson)) return optionsJson;

  return OPTION_KEYS.map((optionKey) => {
    const content = pick(rowMap, [`选项${optionKey}`, `选项 ${optionKey}`, `option${optionKey}`, `option_${optionKey}`, optionKey]);
    return content ? { optionKey, content } : null;
  }).filter(Boolean);
};

const parseRubricPoints = (value) => {
  const jsonValue = parseJsonField(value, null);
  if (Array.isArray(jsonValue)) return jsonValue;

  return `${value ?? ""}`
    .split(/\r?\n/)
    .map((line) => normalizeCellText(line))
    .filter(Boolean)
    .map((line, index) => {
      const [title, score, description, keywords] = line.split("|").map((part) => normalizeCellText(part));
      return {
        title: title || `遗漏点 ${index + 1}`,
        score: score || 0,
        description: description || "",
        keywords: splitList(keywords),
        sortOrder: index + 1,
      };
    });
};

const parseSubQuestions = (rowMap) => {
  const jsonValue = parseJsonField(pick(rowMap, ["subQuestions", "subQuestionsJson", "小问JSON", "小问json"]), null);
  if (Array.isArray(jsonValue)) return jsonValue;

  const subQuestions = [];
  for (let index = 1; index <= 10; index += 1) {
    const title = pick(rowMap, [`小问${index}标题`, `第${index}问标题`, `sub${index}Title`, `subQuestion${index}Title`]);
    const prompt = pick(rowMap, [`小问${index}题干`, `第${index}问题干`, `小问${index}问题`, `第${index}问问题`, `sub${index}Prompt`, `subQuestion${index}Prompt`]);
    const placeholder = pick(rowMap, [`小问${index}作答提示`, `第${index}问作答提示`, `sub${index}Placeholder`]);
    const abilityLabel = pick(rowMap, [`小问${index}能力标签`, `第${index}问能力标签`, `sub${index}AbilityLabel`]);
    const referenceAnswer = pick(rowMap, [`小问${index}参考答案`, `第${index}问参考答案`, `sub${index}ReferenceAnswer`]);
    const analysis = pick(rowMap, [`小问${index}解析`, `第${index}问解析`, `小问${index}答案解析`, `第${index}问答案解析`, `sub${index}Analysis`, `subQuestion${index}Analysis`]);
    const rubricGuidance = pick(rowMap, [`小问${index}批改说明`, `第${index}问批改说明`, `sub${index}RubricGuidance`]);
    const rubricPointsText = pick(rowMap, [`小问${index}遗漏点`, `第${index}问遗漏点`, `sub${index}RubricPoints`]);

    if (!title && !prompt && !placeholder && !abilityLabel && !referenceAnswer && !analysis && !rubricGuidance && !rubricPointsText) continue;
    subQuestions.push({
      title: title || `第${index}问`,
      prompt,
      placeholder,
      abilityLabel,
      referenceAnswer,
      analysis,
      rubricGuidance,
      rubricPoints: parseRubricPoints(rubricPointsText),
      sortOrder: index,
    });
  }
  return subQuestions;
};

const rowHasContent = (row = {}) => Object.values(row).some((value) => normalizeCellText(value));

const normalizeSpreadsheetRow = (row) => {
  const rowMap = normalizeRow(row);
  const item = {
    title: pick(rowMap, ["title", "标题", "题目标题"]),
    questionNo: pick(rowMap, ["questionNo", "题号", "序号"]),
    yearLabel: pick(rowMap, ["yearLabel", "年份", "年度"]),
    pageLabel: pick(rowMap, ["pageLabel", "页码", "页数"]),
    sectionLabel: pick(rowMap, ["sectionLabel", "分区标题", "题型分区", "机考分区"]),
    sectionDescription: pick(rowMap, ["sectionDescription", "分区说明", "题型说明"]),
    tags: splitList(pick(rowMap, ["tags", "标签"])),
    difficulty: normalizeDifficulty(pick(rowMap, ["difficulty", "难度"])),
    type: normalizeQuestionType(pick(rowMap, ["type", "questionType", "题型"])),
    stem: pick(rowMap, ["stem", "题干", "问题"]),
    material: pick(rowMap, ["material", "材料", "案例材料"]),
    analysis: pick(rowMap, ["analysis", "解析", "答案解析"]),
    lessonAudioUrl: pick(rowMap, ["lessonAudioUrl", "音频URL", "音频链接"]),
    lessonAudioObjectKey: pick(rowMap, ["lessonAudioObjectKey", "音频ObjectKey", "音频对象Key"]),
    lessonAudioDurationSeconds: pick(rowMap, ["lessonAudioDurationSeconds", "音频时长秒", "音频时长"]),
    score: pick(rowMap, ["score", "分值", "分数"]),
    sortOrder: pick(rowMap, ["sortOrder", "排序"]),
    correctAnswer: splitList(pick(rowMap, ["correctAnswer", "correctAnswers", "正确答案", "答案"])),
    options: parseOptions(rowMap),
    subQuestions: parseSubQuestions(rowMap),
  };

  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== "";
    }),
  );
};

const parseSpreadsheetBuffer = (buffer) => {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  } catch {
    throw new QuestionImportError("无法读取表格文件，请确认文件是 xlsx、xls 或 csv 格式");
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
    blankrows: false,
  });

  return rows.filter(rowHasContent).map(normalizeSpreadsheetRow);
};

export const parseQuestionImportRoot = (req) => {
  const file = req.file;
  if (file?.buffer?.length) {
    const fileName = `${file.originalname ?? ""}`;
    if (SPREADSHEET_FILE_RE.test(fileName)) return { items: parseSpreadsheetBuffer(file.buffer) };
    return parseJsonText(file.buffer.toString("utf8"));
  }

  if (typeof req.body?.json === "string" && req.body.json.trim()) return parseJsonText(req.body.json);
  if (typeof req.body?.payload === "string" && req.body.payload.trim()) return parseJsonText(req.body.payload);
  return req.body;
};
