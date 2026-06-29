import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appPath = path.resolve("src/app/App.tsx");
const source = fs.readFileSync(appPath, "utf8");

test("official subjective law dialog keeps the embedded law search inside a full-size wrapper", () => {
  const dialogStart = source.indexOf("{officialLawDialogOpen ? (");
  assert.notEqual(dialogStart, -1, "未找到授权题库主观题法条弹窗。");

  const contentContainerStart = source.indexOf(
    'style={{ position: "absolute", left: 0, right: 0, top: "41px", bottom: 0, background: "#fff", overflow: "hidden" }}',
    dialogStart,
  );
  assert.notEqual(contentContainerStart, -1, "未找到法条弹窗内容容器。");

  const fullSizeWrapperStart = source.indexOf(
    'style={{ width: "100%", height: "100%", background: "#fff" }}',
    contentContainerStart,
  );
  assert.notEqual(
    fullSizeWrapperStart,
    -1,
    "授权题库主观题做题页的法条弹窗缺少 100% 宽高包装层，embedded 法条检索会出现滚动和内容区异常。",
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
