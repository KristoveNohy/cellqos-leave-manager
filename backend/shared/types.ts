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

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId: number | null;
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
  type: LeaveType;
  startDate: string;
  endDate: string;
  isHalfDayStart: boolean;
  isHalfDayEnd: boolean;
  status: LeaveStatus;
  reason: string | null;
  managerComment: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  computedDays: number;
  attachmentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  isCompanyHoliday: boolean;
  createdAt: Date;
}

export interface LeaveBalance {
  id: number;
  userId: string;
  year: number;
  allowanceDays: number;
  usedDays: number;
  remainingDays: number;
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
