import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAnnualLeaveAllowance,
  computeCarryOverDays,
  getAnnualLeaveGroupAllowance,
} from "./leave-entitlement";

test("calculates group allowance based on age and child status", () => {
  assert.equal(
    getAnnualLeaveGroupAllowance({ birthDate: "1995-01-01", hasChild: false, year: 2024 }),
    20
  );
  assert.equal(
    getAnnualLeaveGroupAllowance({ birthDate: "1985-01-01", hasChild: false, year: 2024 }),
    25
  );
  assert.equal(
    getAnnualLeaveGroupAllowance({ birthDate: null, hasChild: true, year: 2024 }),
    25
  );
});

test("applies pro-rata allowance for employees starting mid-year", () => {
  const allowance = computeAnnualLeaveAllowance({
    birthDate: "1995-01-01",
    hasChild: false,
    year: 2024,
    employmentStartDate: "2024-03-10",
    accrualPolicy: "PRO_RATA",
  });

  assert.equal(allowance, 16.67);
});

test("uses manual allowance for the start year when provided", () => {
  const allowance = computeAnnualLeaveAllowance({
    birthDate: "1995-01-01",
    hasChild: false,
    year: 2024,
    employmentStartDate: "2024-04-01",
    manualAllowanceDays: 12.5,
    accrualPolicy: "PRO_RATA",
  });

  assert.equal(allowance, 12.5);
});

test("returns zero allowance before employment start year", () => {
  const allowance = computeAnnualLeaveAllowance({
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
    computeCarryOverDays({
      previousAllowance: 25,
      previousUsed: 5,
      carryOverLimit: 25,
    }),
    20
  );

  assert.equal(
    computeCarryOverDays({
      previousAllowance: 30,
      previousUsed: 0,
      carryOverLimit: 20,
    }),
    20
  );
});
