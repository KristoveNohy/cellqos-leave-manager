import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAnnualLeaveAllowanceHours,
  computeCarryOverHours,
  getAnnualLeaveGroupAllowanceHours,
} from "./leave-entitlement";
import { HOURS_PER_WORKDAY } from "./date-utils";

test("calculates group allowance based on age and child status", () => {
  assert.equal(
    getAnnualLeaveGroupAllowanceHours({ birthDate: "1995-01-01", hasChild: false, year: 2024 }),
    20 * HOURS_PER_WORKDAY
  );
  assert.equal(
    getAnnualLeaveGroupAllowanceHours({ birthDate: "1985-01-01", hasChild: false, year: 2024 }),
    25 * HOURS_PER_WORKDAY
  );
  assert.equal(
    getAnnualLeaveGroupAllowanceHours({ birthDate: null, hasChild: true, year: 2024 }),
    25 * HOURS_PER_WORKDAY
  );
});

test("applies pro-rata allowance for employees starting mid-year", () => {
  const allowance = computeAnnualLeaveAllowanceHours({
    birthDate: "1995-01-01",
    hasChild: false,
    year: 2024,
    employmentStartDate: "2024-03-10",
    accrualPolicy: "PRO_RATA",
  });

  assert.equal(allowance, 133.33);
});

test("uses manual allowance for the start year when provided", () => {
  const allowance = computeAnnualLeaveAllowanceHours({
    birthDate: "1995-01-01",
    hasChild: false,
    year: 2024,
    employmentStartDate: "2024-04-01",
    manualAllowanceHours: 12.5 * HOURS_PER_WORKDAY,
    accrualPolicy: "PRO_RATA",
  });

  assert.equal(allowance, 100);
});

test("returns zero allowance before employment start year", () => {
  const allowance = computeAnnualLeaveAllowanceHours({
    birthDate: "1995-01-01",
    hasChild: false,
    year: 2024,
    employmentStartDate: "2025-01-15",
    accrualPolicy: "PRO_RATA",
  });

  assert.equal(allowance, 0);
});

test("caps carry-over by the group allowance limit", () => {
  assert.equal(
    computeCarryOverHours({
      previousAllowance: 25 * HOURS_PER_WORKDAY,
      previousUsed: 5 * HOURS_PER_WORKDAY,
      carryOverLimit: 25 * HOURS_PER_WORKDAY,
    }),
    20 * HOURS_PER_WORKDAY
  );

  assert.equal(
    computeCarryOverHours({
      previousAllowance: 30 * HOURS_PER_WORKDAY,
      previousUsed: 0,
      carryOverLimit: 20 * HOURS_PER_WORKDAY,
    }),
    20 * HOURS_PER_WORKDAY
  );
});
