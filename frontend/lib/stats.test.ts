import assert from "node:assert/strict";
import test from "node:test";
import { buildStatsQuery, leaveTypeLabel } from "./stats";

test("buildStatsQuery normalizes optional fields", () => {
  const query = buildStatsQuery({ year: 2024 });
  assert.equal(query.year, 2024);
  assert.deepEqual(query.memberIds, []);
  assert.deepEqual(query.eventTypes, []);
});

test("leave type labels are present", () => {
  assert.equal(leaveTypeLabel.ANNUAL_LEAVE, "Dovolenka");
});
