import { NextResponse } from "next/server";
import {
  createUserAccount,
  listUserAccounts,
  updateUserAccount,
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import { hashPassword } from "@/core/security/password.security";
import { assertUserReferencesValid } from "@/modules/user-master/validators/user-master.validator";
import {
  ADMIN_ROLE_PERMISSION_MAP,
  requireActionPermission,
  sanitizeUserRecord,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

const WRITABLE_USER_FIELDS = [
  "username",
  "email",
  "first_name",
  "last_name",
  "phone",
  "address",
  "comp_id",
  "dept_id",
  "status_id",
  "is_active",
];

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getAdminAppKey(request) {
  const { searchParams } = new URL(request.url);
  return (
    String(searchParams.get("appKey") || "").trim() ||
    String(process.env.USER_MASTER_ADMIN_APP_KEY || "").trim() ||
    null
  );
}

function buildUserPayload(body) {
  const payload = {};
  WRITABLE_USER_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) {
      payload[field] = body[field];
    }
  });
  return payload;
}

export async function GET(request) {
  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "read",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") !== "false";

    const users = await listUserAccounts({
      supabaseClient: gate.context.supabaseClient,
      includeInactive,
      filters: {
        companyId: searchParams.get("comp_id") || undefined,
        departmentId: searchParams.get("dept_id") || undefined,
        statusId: searchParams.get("status_id") || undefined,
      },
      limit: searchParams.get("limit") || undefined,
    });

    return NextResponse.json({
      users: users.map((record) => sanitizeUserRecord(record)),
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list users", 500);
  }
}

export async function POST(request) {
  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "create",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const payload = buildUserPayload(body);
    const rawPassword = String(body?.password || "").trim();

    if (!hasValue(payload.username) && !hasValue(payload.email)) {
      return toErrorResponse("username or email is required", 400);
    }

    if (!rawPassword) {
      return toErrorResponse("password is required when creating a user", 400);
    }

    await assertUserReferencesValid(gate.context.supabaseClient, {
      comp_id: payload.comp_id,
      dept_id: payload.dept_id,
      status_id: payload.status_id,
    });

    payload.password_hash = await hashPassword(rawPassword);

    const created = await createUserAccount({
      payload,
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    return NextResponse.json({
      message: "User created",
      user: sanitizeUserRecord(created),
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create user", 500);
  }
}

export async function PATCH(request) {
  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "update",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const userId = body?.user_id ?? body?.userId;

    if (!hasValue(userId)) {
      return toErrorResponse("user_id is required", 400);
    }

    const updates = buildUserPayload(body);
    const rawPassword = String(body?.password || "").trim();

    if (rawPassword) {
      updates.password_hash = await hashPassword(rawPassword);
    }

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No valid update fields were provided", 400);
    }

    const { data: existingUser, error: existingUserError } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.users)
      .select("comp_id")
      .eq(USER_MASTER_COLUMNS.userId, userId)
      .maybeSingle();

    if (existingUserError) throw existingUserError;

    await assertUserReferencesValid(gate.context.supabaseClient, {
      comp_id: updates.comp_id,
      dept_id: updates.dept_id,
      status_id: updates.status_id,
      existingCompanyId: existingUser?.comp_id,
    });

    const updated = await updateUserAccount({
      userId,
      updates,
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    return NextResponse.json({
      message: "User updated",
      user: sanitizeUserRecord(updated),
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update user", 500);
  }
}

export async function DELETE(request) {
  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "delete",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id") || searchParams.get("userId");
    const hardDelete = searchParams.get("hard") === "true";

    if (!hasValue(userId)) {
      return toErrorResponse("user_id is required", 400);
    }

    if (hardDelete && !gate.permission.isDevMain) {
      return toErrorResponse("Only devmain can hard delete users", 403);
    }

    if (hardDelete) {
      const { error } = await gate.context.supabaseClient
        .from(USER_MASTER_TABLES.users)
        .delete()
        .eq(USER_MASTER_COLUMNS.userId, userId);

      if (error) throw error;

      return NextResponse.json({ message: "User deleted" });
    }

    const updated = await updateUserAccount({
      userId,
      updates: { is_active: false },
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    return NextResponse.json({
      message: "User deactivated",
      user: sanitizeUserRecord(updated),
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete/deactivate user", 500);
  }
}


