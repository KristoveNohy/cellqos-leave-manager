export type UserRole = "EMPLOYEE" | "MANAGER";

export type LeaveType = 
  | "ANNUAL_LEAVE" 
  | "SICK_LEAVE" 
  | "HOME_OFFICE" 
  | "UNPAID_LEAVE" 
  | "OTHER";

export type LeaveStatus = 
  | "DRAFT" 
  | "PENDING" 
  | "APPROVED" 
  | "REJECTED" 
  | "CANCELLED";

export type VacationAccrualPolicy =
  | "YEAR_START"
  | "PRO_RATA";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId: number | null;
  employmentStartDate: string | null;
  birthDate: string | null;
  hasChild: boolean;
  manualLeaveAllowanceHours: number | null;
  remainingLeaveHours?: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: number;
  name: string;
  maxConcurrentLeaves: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaveRequest {
  id: number;
  userId: string;
  userName?: string | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  isHalfDayStart: boolean;
  isHalfDayEnd: boolean;
  status: LeaveStatus;
  reason: string | null;
  managerComment: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  computedHours: number;
  currentBalanceHours?: number | null;
  balanceAfterApprovalHours?: number | null;
  attachmentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  isCompanyHoliday: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface LeaveBalance {
  id: number;
  userId: string;
  year: number;
  allowanceHours: number;
  usedHours: number;
  remainingHours: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: number;
  actorUserId: string;
  actorName?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson: any;
  afterJson: any;
  createdAt: Date;
}

export interface Notification {
  id: number;
  userId: string;
  type: string;
  payloadJson: any;
  dedupeKey?: string | null;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface VacationPolicy {
  accrualPolicy: VacationAccrualPolicy;
  carryOverEnabled: boolean;
  carryOverLimitHours: number;
}
