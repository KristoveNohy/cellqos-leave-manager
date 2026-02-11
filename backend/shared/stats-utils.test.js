import assert from "node:assert/strict";
import test from "node:test";
import { buildStatsDateRange, isValidLeaveType, parseCsvList } from "./stats-utils";
test("builds full-year stats range", () => {
    const range = buildStatsDateRange({ year: 2024 });
    assert.equal(range.startDate, "2024-01-01");
    assert.equal(range.endDate, "2024-12-31");
    assert.equal(range.months.length, 12);
});
test("builds month stats range", () => {
    const range = buildStatsDateRange({ year: 2024, month: 4 });
    assert.equal(range.startDate, "2024-04-01");
    assert.equal(range.endDate, "2024-04-30");
    assert.deepEqual(range.months, [4]);
});
test("builds quarter stats range", () => {
    const range = buildStatsDateRange({ year: 2024, quarter: 2 });
    assert.equal(range.startDate, "2024-04-01");
    assert.equal(range.endDate, "2024-06-30");
    assert.deepEqual(range.months, [4, 5, 6]);
});
test("parses CSV lists", () => {
    assert.deepEqual(parseCsvList("a, b ,c"), ["a", "b", "c"]);
    assert.deepEqual(parseCsvList(""), []);
});
test("validates leave types", () => {
    assert.equal(isValidLeaveType("ANNUAL_LEAVE"), true);
    assert.equal(isValidLeaveType("UNKNOWN"), false);
});
//# sourceMappingURL=stats-utils.test.js.map