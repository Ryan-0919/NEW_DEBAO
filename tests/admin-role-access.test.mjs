import test from "node:test";
import assert from "node:assert/strict";

import { ADMIN_ROLE_VALUES, hasAdminRoleAccess, normalizeAdminRole } from "../server/lib/admin-role.js";

test("兼职批改老师角色属于合法后台角色", () => {
  assert.equal(ADMIN_ROLE_VALUES.includes("part_time_reviewer"), true);
  assert.equal(normalizeAdminRole("part_time_reviewer", "operations_admin"), "part_time_reviewer");
});

test("兼职批改老师只在被允许时通过角色校验", () => {
  assert.equal(hasAdminRoleAccess("part_time_reviewer", ["part_time_reviewer", "review_admin"]), true);
  assert.equal(hasAdminRoleAccess("part_time_reviewer", ["review_admin"]), false);
  assert.equal(hasAdminRoleAccess("part_time_reviewer", ["operations_admin"]), false);
});
