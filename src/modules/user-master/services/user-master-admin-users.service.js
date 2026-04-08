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
  "middle_name",
  "last_name",
  "phone",
  "address",
  "position",
  "hire_date",
  "comp_id",
  "dept_id",
  "status_id",
];

const STATUS_TEXT_FIELDS = [
  "status_name",
  "sts_name",
  "name",
  "code",
  "status_code",
  "status",
  "label",
  "description",
  "status_desc",
  "status_description",
  "sts_desc",
  "slug",
  "key",
];

const INACTIVE_STATUS_HINTS = [
  "inactive",
  "disabled",
  "suspended",
  "locked",
  "deleted",
  "blocked",
  "archived",
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

function statusLooksInactive(statusRecord) {
  if (!statusRecord || typeof statusRecord !== "object") return false;

  if (statusRecord.is_active === false) {
    return true;
  }

  const mergedText = STATUS_TEXT_FIELDS.map((field) => statusRecord[field])
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  if (!mergedText) return false;
  return INACTIVE_STATUS_HINTS.some((keyword) => mergedText.includes(keyword));
}

async function deriveActiveStateFromStatusId(supabaseClient, statusId) {
  if (!hasValue(statusId)) {
    return true;
  }

  const { data, error } = await supabaseClient
    .from(USER_MASTER_TABLES.statuses)
    .select("*")
    .eq(USER_MASTER_COLUMNS.statusId, statusId)
    .maybeSingle();

  if (error) throw error;
  return !statusLooksInactive(data || null);
}

export async function GET(request) {
  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "read",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
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

    const safeUsers = users.map((record) => sanitizeUserRecord(record));

    return NextResponse.json({
      success: true,
      message: "Users loaded",
      data: {
        users: safeUsers,
      },
      users: safeUsers,
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
      requiredRoleKey: "devmain",
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

    payload.is_active = await deriveActiveStateFromStatusId(
      gate.context.supabaseClient,
      payload.status_id
    );

    payload.password_hash = await hashPassword(rawPassword);

    const created = await createUserAccount({
      payload,
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    const safeUser = sanitizeUserRecord(created);

    return NextResponse.json({
      success: true,
      message: "User created",
      data: {
        user: safeUser,
      },
      user: safeUser,
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
      requiredRoleKey: "devmain",
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

    if (Object.prototype.hasOwnProperty.call(updates, "status_id")) {
      updates.is_active = await deriveActiveStateFromStatusId(
        gate.context.supabaseClient,
        updates.status_id
      );
    }

    const updated = await updateUserAccount({
      userId,
      updates,
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    const safeUser = sanitizeUserRecord(updated);

    return NextResponse.json({
      success: true,
      message: "User updated",
      data: {
        user: safeUser,
      },
      user: safeUser,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update user", 500);
  }
}

export async function DELETE(request) {
  let hardDeleteRequested = false;

  try {
    const appKey = getAdminAppKey(request);
    const gate = await requireActionPermission({
      action: "delete",
      appKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id") || searchParams.get("userId");
    const hardDelete = searchParams.get("hard") === "true";
    hardDeleteRequested = hardDelete;

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

      return NextResponse.json({
        success: true,
        message: "User deleted",
        data: {
          user_id: userId,
          deleted: true,
        },
      });
    }

    const updated = await updateUserAccount({
      userId,
      updates: { is_active: false },
      actorUserId: gate.context.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: gate.context.supabaseClient,
    });

    const safeUser = sanitizeUserRecord(updated);

    return NextResponse.json({
      success: true,
      message: "User deactivated",
      data: {
        user: safeUser,
      },
      user: safeUser,
    });
  } catch (error) {
    if (hardDeleteRequested && String(error?.code || "") === "23503") {
      return toErrorResponse("Cannot delete: record is in use", 409);
    }

    return toErrorResponse(error?.message || "Unable to delete/deactivate user", 500);
  }
}


