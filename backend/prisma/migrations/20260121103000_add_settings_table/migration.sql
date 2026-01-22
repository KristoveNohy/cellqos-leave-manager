-- CreateTable
CREATE TABLE "settings" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "show_team_calendar_for_employees" BOOLEAN NOT NULL DEFAULT false,
    "annual_leave_accrual_policy" TEXT NOT NULL DEFAULT 'YEAR_START',
    "carry_over_enabled" BOOLEAN NOT NULL DEFAULT false,
    "carry_over_limit_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "settings" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;
