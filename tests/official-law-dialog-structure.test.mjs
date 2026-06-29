import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/app/App.tsx");
const source = fs.readFileSync(appPath, "utf8");

test("official subjective law dialog keeps the embedded law search inside a full-size wrapper", () => {
  const dialogStart = source.indexOf("{officialLawDialogOpen ? (");
  assert.notEqual(dialogStart, -1, "未找到授权题库主观题法条弹窗。");

  const contentContainerMatch = source.slice(dialogStart).match(
    /style=\{\{\s*position: "absolute",\s*left: 0,\s*right: 0,\s*top: "41px",\s*bottom: 0,\s*background: "#fff",\s*overflow: "hidden",\s*\}\}/,
  );
  const contentContainerStart = contentContainerMatch ? dialogStart + contentContainerMatch.index : -1;
  assert.notEqual(contentContainerStart, -1, "未找到法条弹窗内容容器。");

  const fullSizeWrapperStart = source.indexOf(
    'style={{ width: "100%", height: "100%", background: "#fff" }}',
    contentContainerStart,
  );
  assert.notEqual(
    fullSizeWrapperStart,
    -1,
    "授权题库主观题做题页的法条弹窗缺少 100% 宽高包裹层，embedded 法条检索会出现滚动和内容区异常。",
  );

  const embeddedLawSearchStart = source.indexOf("<DebaoLawSearchPage", fullSizeWrapperStart);
  assert.notEqual(embeddedLawSearchStart, -1, "未找到嵌入式法条检索组件。");

  const embeddedPropIndex = source.indexOf("embedded", embeddedLawSearchStart);
  assert.notEqual(embeddedPropIndex, -1, "法条检索组件未以 embedded 模式渲染。");

  assert.ok(
    embeddedLawSearchStart > fullSizeWrapperStart && fullSizeWrapperStart > contentContainerStart,
    "法条弹窗结构顺序不对，embedded 法条检索必须包在 100% 宽高容器内。",
  );
});

test("official subjective law dialog uses the same constrained shell behavior as mock exam law search", () => {
  assert.match(source, /const OFFICIAL_LAW_DIALOG_MIN_WIDTH = 640;/, "授权题库法条弹窗缺少与机考一致的最小宽度限制。");
  assert.match(source, /const OFFICIAL_LAW_DIALOG_MIN_HEIGHT = 420;/, "授权题库法条弹窗缺少与机考一致的最小高度限制。");
  assert.match(source, /const OFFICIAL_LAW_DIALOG_MARGIN = 16;/, "授权题库法条弹窗缺少边距限制。");
  assert.match(source, /const OFFICIAL_LAW_DIALOG_TOP_MARGIN = 8;/, "授权题库法条弹窗缺少顶部边距限制。");
  assert.match(source, /const clampOfficialLawDialogRect = \(rect: OfficialDialogRect\) => \{/, "授权题库法条弹窗缺少统一的边界约束函数。");
  assert.match(source, /const buildOfficialLawDialogRect = \(\) => \{/, "授权题库法条弹窗缺少默认尺寸构造函数。");
  assert.match(source, /const buildOfficialLawDialogMaxRect = \(\) => \{/, "授权题库法条弹窗缺少最大化尺寸构造函数。");
  assert.match(
    source,
    /const resizeOfficialLawDialogRect = \(startRect: OfficialDialogRect, direction: OfficialDialogResizeDirection, dx: number, dy: number\) => \{/,
    "授权题库法条弹窗缺少与机考一致的缩放计算函数。",
  );
  assert.match(
    source,
    /const getOfficialLawDialogCursor = \(action: OfficialLawDialogAction \| null\) => \{/,
    "授权题库法条弹窗缺少与机考一致的游标计算函数。",
  );
  assert.match(
    source,
    /const \[officialLawDialogInteracting, setOfficialLawDialogInteracting\] = useState\(false\);/,
    "授权题库法条弹窗缺少交互遮罩状态，拖拽时容易出现内容区干扰。",
  );
  assert.match(
    source,
    /const officialLawDialogActionRef = useRef<OfficialLawDialogAction \| null>\(null\);/,
    "授权题库法条弹窗缺少统一的拖拽/缩放动作管理。",
  );
  assert.match(
    source,
    /const openOfficialLawDialog = \(\) => \{[\s\S]*?clampOfficialLawDialogRect\(officialLawDialogRestoreRectRef\.current \?\? current\)[\s\S]*?setOfficialLawDialogOpen\(true\);[\s\S]*?\}/,
    "授权题库法条弹窗打开时未先统一校正尺寸。",
  );
  assert.match(
    source,
    /const closeOfficialLawDialog = \(\) => \{[\s\S]*?setOfficialLawDialogInteracting\(false\);[\s\S]*?document\.body\.style\.userSelect = ""[\s\S]*?setOfficialLawDialogOpen\(false\);[\s\S]*?\}/,
    "授权题库法条弹窗关闭时未完整清理拖拽状态。",
  );
  assert.match(
    source,
    /cursor: getOfficialLawDialogCursor\(officialLawDialogActionRef\.current\) \|\| "move"/,
    "授权题库法条弹窗缺少交互期间的透明遮罩层游标同步。",
  );
  assert.match(source, /className="border-row border-top"/, "授权题库法条弹窗未使用与机考一致的拖拽边框结构。");
  assert.match(source, /className="border-col border-right"/, "授权题库法条弹窗右侧拖拽边框缺失。");
  assert.match(source, /className="horn rig-bott"/, "授权题库法条弹窗右下角缩放把手缺失。");
});
