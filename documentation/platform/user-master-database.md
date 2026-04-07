# User Master Database and Access Control

This document defines the centralized User Master Database used by PSBUniverse to manage users, company and department ownership, and role-based application access.

## Design Goals

- Store and manage all user accounts in one source.
- Handle role-to-application access without per-module permission tables.
- Support multi-company and multi-department assignment.
- Track creation and update metadata for auditability.

## Core Tables

### psb_s_user

Main user table for identity and profile data.

Referenced columns:

- user_id
- username
- email
- password_hash
- first_name
- last_name
- phone
- address
- comp_id
- dept_id
- status_id
- is_active
- created_at
- updated_at
- created_by
- updated_by

### psb_s_company

Company master table.

- One company can have many departments and many users.

### psb_s_department

Department master table.

- Linked to company through comp_id.
- One department can have many users.

### psb_s_role

Role reference table for access policy identity (for example admin, staff, devmain).

### psb_s_application

Application registry table used to scope role access by module/application.

### psb_s_status

Status reference table for user lifecycle states (for example active, inactive).

### psb_m_userappproleaccess

Mapping table for role-based application access.

Referenced columns:

- user_id
- role_id
- app_id

Recommended DB constraint:

- Unique key on (user_id, role_id, app_id)

## Relationship Model

- psb_s_company(1) -> psb_s_department(m)
- psb_s_company(1) -> psb_s_user(m)
- psb_s_department(1) -> psb_s_user(m)
- psb_s_user(m) <-> psb_s_role(m) through psb_m_userappproleaccess
- psb_s_application(1) -> psb_m_userappproleaccess(m)

## Access Resolution Logic

Access is resolved dynamically from mapping rows in psb_m_userappproleaccess.

Effective scope key:

- (user_id, role_id, app_id)

Rules:

- A user can hold multiple roles.
- A role can apply to multiple applications.
- No separate permission table is required.
- Backend code determines CRUD behavior from role identity.

## Special Role: devmain

Role key:

- devmain

Behavior:

- Bypasses standard application-level access checks.
- Grants full CRUD on all modules and tables.
- Does not require app_id match to pass access checks.

## Backend Utility in This Repository

The centralized resolver is implemented at:

- src/modules/user-master/access/user-master.access.js

Primary exported helpers:

- listUserAccounts
- getUserAccountById
- createUserAccount
- updateUserAccount
- upsertUserAppRoleAccess
- removeUserAppRoleAccess
- resolveUserRoleAccess
- assertUserCanPerformAction

Example usage:

```js
import { assertUserCanPerformAction } from "@/modules/user-master/access/user-master.access";

await assertUserCanPerformAction({
  userId: sessionUserId,
  appKey: "gutter",
  action: "update",
  rolePermissionMap: {
    admin: ["create", "read", "update", "delete"],
    staff: ["read"],
  },
});
```

## Operational Rules

- All user create/update flows must target psb_s_user.
- Mapping updates must target psb_m_userappproleaccess.
- Module routes should gate write operations via assertUserCanPerformAction.
- Role name conventions should remain stable (especially devmain).