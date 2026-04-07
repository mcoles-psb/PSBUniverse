# User Master Access Library

File:

- src/modules/user-master/access/user-master.access.js

## Purpose

Provide centralized helper functions for:

- User account create/read/update against psb_s_user.
- User-role-app mapping maintenance in psb_m_userappproleaccess.
- Runtime access resolution using mapping tuples (user_id, role_id, app_id).
- devmain superuser bypass behavior.

## Key Exports

- listUserAccounts
- getUserAccountById
- createUserAccount
- updateUserAccount
- upsertUserAppRoleAccess
- removeUserAppRoleAccess
- resolveUserRoleAccess
- assertUserCanPerformAction

## Defaults

- Tables default to psb_* names defined in USER_MASTER_TABLES.
- Columns default to *_id keys in USER_MASTER_COLUMNS.
- Role key devmain receives full CRUD with bypassStandardChecks=true.

## Permission Model

- Base access is determined by existence of mapping rows.
- Optional rolePermissionMap refines CRUD action grants per role key.
- Optional wildcard rolePermissionMap[*] applies permissions to all roles.

## Example

```js
import { resolveUserRoleAccess } from "@/modules/user-master/access/user-master.access";

const access = await resolveUserRoleAccess({
  userId,
  appKey: "setup-global",
  rolePermissionMap: {
    admin: ["create", "read", "update", "delete"],
    staff: ["read"],
  },
});

if (!access.permissions.update) {
  throw new Error("Update not allowed");
}
```