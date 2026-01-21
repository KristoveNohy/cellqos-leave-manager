# CellQos Leave Manager

A comprehensive leave and absence management system with role-based access control.

## Features

### Core Features (MVP)
- **Calendar View**: Monthly/weekly view of all leave requests
- **Leave Requests**: Create, edit, cancel requests with multiple types (Annual, Sick, Home Office, Unpaid, Other)
- **Approval Workflow**: Managers can approve/reject requests with comments
- **Role-Based Access Control**:
  - **EMPLOYEE**: View own calendar, create/edit own requests (limited to DRAFT/PENDING)
  - **MANAGER**: Full access to all requests, user management, approval workflow

### Advanced Features (v1)
- **Team Limits**: Maximum concurrent approved leaves per day
- **Holidays**: Slovak holidays + custom holiday management
- **Export**: CSV export of leave requests
- **Bulk Operations**: Approve/reject multiple requests at once
- **Search & Filters**: Advanced filtering by user, type, status, dates, team
- **Attachments**: Upload documents for sick leave and other types
- **Audit Log**: Complete history of all changes
- **Leave Balance**: Track allowance, used, and remaining days

## Tech Stack

- **Frontend**: React, TypeScript, shadcn/ui, React Big Calendar, React Hook Form, Zod
- **Backend**: Encore.ts, PostgreSQL
- **Authentication**: Clerk (to be configured)

## Database Schema

### Tables

**users**
- id (string, primary key) - Clerk user ID
- email (string, unique)
- name (string)
- role (enum: EMPLOYEE, MANAGER)
- team_id (bigint, foreign key)
- is_active (boolean)
- created_at, updated_at (timestamp)

**teams**
- id (bigserial, primary key)
- name (string, unique)
- max_concurrent_leaves (integer, nullable) - Max people on leave simultaneously
- created_at, updated_at (timestamp)

**leave_requests**
- id (bigserial, primary key)
- user_id (string, foreign key)
- type (enum: ANNUAL_LEAVE, SICK_LEAVE, HOME_OFFICE, UNPAID_LEAVE, OTHER)
- start_date (date)
- end_date (date)
- is_half_day_start (boolean) - AM/PM for first day
- is_half_day_end (boolean) - AM/PM for last day
- status (enum: DRAFT, PENDING, APPROVED, REJECTED, CANCELLED)
- reason (text, nullable)
- manager_comment (text, nullable)
- approved_by (string, nullable) - Manager user ID
- approved_at (timestamp, nullable)
- computed_days (double precision) - Working days excluding weekends/holidays
- attachment_url (text, nullable)
- created_at, updated_at (timestamp)

**holidays**
- id (bigserial, primary key)
- date (date, unique)
- name (string)
- is_company_holiday (boolean)
- created_at (timestamp)

**leave_balances**
- id (bigserial, primary key)
- user_id (string, foreign key)
- year (integer)
- allowance_days (double precision)
- used_days (double precision)
- created_at, updated_at (timestamp)
- UNIQUE(user_id, year)

**audit_logs**
- id (bigserial, primary key)
- actor_user_id (string) - Who made the change
- entity_type (string) - Table name
- entity_id (string) - Record ID
- action (string) - CREATE, UPDATE, DELETE, APPROVE, REJECT, etc.
- before_json (jsonb, nullable)
- after_json (jsonb, nullable)
- created_at (timestamp)

**notifications**
- id (bigserial, primary key)
- user_id (string, foreign key)
- type (string) - REQUEST_SUBMITTED, REQUEST_APPROVED, etc.
- payload_json (jsonb)
- sent_at (timestamp, nullable)
- read_at (timestamp, nullable)
- created_at (timestamp)

## Business Rules

1. **Overlap Prevention**: No overlapping PENDING or APPROVED requests for the same user
2. **Past Dates**: Cannot create requests in the past (configurable)
3. **Weekend Handling**: Weekends are excluded from leave day calculations
4. **Holiday Handling**: Company holidays are excluded from leave day calculations
5. **Half-Day Support**: 0.5 days for AM/PM half-days
6. **Team Limits**: Maximum concurrent approved leaves enforced per team
7. **Manager Override**: Managers can override rules with audit logging
8. **Timezone**: All dates use Europe/Bratislava timezone
9. **Status Transitions**:
   - DRAFT → PENDING (submit)
   - PENDING → APPROVED/REJECTED (manager)
   - PENDING → CANCELLED (employee/manager)
   - Any status → CANCELLED (manager only)

## API Endpoints

### Leave Requests
- `POST /leave-requests` - Create request
- `GET /leave-requests` - List requests (filterable)
- `GET /leave-requests/:id` - Get request details
- `PATCH /leave-requests/:id` - Update request
- `POST /leave-requests/:id/submit` - Submit DRAFT → PENDING
- `POST /leave-requests/:id/approve` - Approve request (manager)
- `POST /leave-requests/:id/reject` - Reject request (manager)
- `POST /leave-requests/:id/cancel` - Cancel request
- `DELETE /leave-requests/:id` - Delete request (manager)

### Users
- `GET /users` - List users (manager)
- `GET /users/:id` - Get user (manager)
- `POST /users` - Create user (manager)
- `PATCH /users/:id` - Update user (manager)
- `DELETE /users/:id` - Deactivate user (manager)
- `GET /users/me` - Get current user

### Teams
- `GET /teams` - List teams
- `GET /teams/:id` - Get team
- `POST /teams` - Create team (manager)
- `PATCH /teams/:id` - Update team (manager)
- `DELETE /teams/:id` - Delete team (manager)

### Holidays
- `GET /holidays` - List holidays
- `POST /holidays` - Create holiday (manager)
- `DELETE /holidays/:id` - Delete holiday (manager)

### Calendar
- `GET /calendar` - Get calendar view (date range, team filter)

### Audit
- `GET /audit` - Get audit logs (manager)

### Export
- `GET /export/leave-requests` - Export to CSV (manager)

## Setup

1. Install dependencies (automatic)
2. Configure authentication via Clerk (see setup instructions)
3. Database migrations run automatically
4. Seed data is automatically loaded

## Demo Accounts (after Clerk setup)

- **Manager**: manager@cellqos.com (full access)
- **Employees**:
  - anna@cellqos.com
  - peter@cellqos.com
  - lucia@cellqos.com

## Architecture

- **Backend Services**: Modular Encore.ts services for each domain
- **Frontend**: Component-based React architecture with role guards
- **State Management**: React Query for server state
- **Validation**: Zod schemas on both client and server
- **Security**: Server-side RBAC checks on all endpoints
