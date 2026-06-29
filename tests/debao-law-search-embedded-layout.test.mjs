import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const lawSearchPath = path.resolve("src/app/pages/user/DebaoLawSearchPage.tsx");
const source = fs.readFileSync(lawSearchPath, "utf8");

test("embedded law search breaks the 100vh height chain inside dialogs", () => {
  assert.match(
    source,
    /<div className=\{`debao-law-page\$\{embedded \? " embedded" : ""\}`\}>/,
    "法条检索根节点需要在 embedded 模式挂载单独类名，便于打断弹窗里的 100vh 高度链。",
  );

  assert.match(
    source,
    /\.debao-law-page\.embedded\{height:100%;min-height:0;overflow:hidden\}/,
    "embedded 法条检索根节点缺少专门的高度和滚动约束，非最大化弹窗会被 100vh 顶出容器。",
  );

  assert.match(
    source,
    /\.debao-law-outer\.embedded\{min-height:0;height:100%;padding:0;background:#f5f5f5\}/,
    "embedded 法条检索外层容器缺少 min-height:0，弹窗内部高度仍会被根层撑开。",
  );

  assert.match(
    source,
    /\.debao-law-body\{display:flex;position:relative;height:calc\(100% - 40px\);min-height:0;border-top:1px solid #dfdfdf\}/,
    "embedded 法条检索主体缺少 min-height:0，左右两栏无法在弹窗里正确收缩。",
  );

  assert.match(
    source,
    /\.debao-law-right\{flex:1;min-width:0;width:auto;height:100%;min-height:0;line-height:22px;white-space:pre-wrap;user-select:text;overflow-y:auto;background:#fff;color:#404040\}/,
    "embedded 法条检索正文区缺少 min-height:0，非最大化时会出现内容被裁掉且无法下滑。",
  );
});
