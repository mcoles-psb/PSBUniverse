import { NextResponse } from "next/server";
import {
  assertUserCanPerformAction,
  CRUD_ACTIONS,
  getUserAccountById,
  resolveUserRoleAccess,
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import { getServerSupabaseClient } from "@/infrastructure/supabase/server";
import { readSessionPayloadFromCookies } from "@/modules/user-master/session/user-master.session";

const STATUS_TEXT_FIELDS = [
  "status_name",
  "name",
  "code",
  "status_code",
  "label",
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

export const ADMIN_ROLE_PERMISSION_MAP = {
  admin: [...CRUD_ACTIONS],
};

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function statusLooksInactive(statusRecord) {
  if (!statusRecord || typeof statusRecord !== "object") return false;

  const mergedText = STATUS_TEXT_FIELDS.map((field) => statusRecord[field])
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  if (!mergedText) return false;
  return INACTIVE_STATUS_HINTS.some((keyword) => mergedText.includes(keyword));
}

async function getUserStatusRecord(userRecord, supabaseClient) {
  if (!hasValue(userRecord?.[USER_MASTER_COLUMNS.statusId])) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from(USER_MASTER_TABLES.statuses)
    .select("*")
    .eq(USER_MASTER_COLUMNS.statusId, userRecord[USER_MASTER_COLUMNS.statusId])
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export function sanitizeUserRecord(userRecord) {
  if (!userRecord || typeof userRecord !== "object") {
    return null;
  }

  const { password_hash: _passwordHash, ...safeUser } = userRecord;
  return safeUser;
}

export function toErrorResponse(message, status = 400, details) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

export async function getAuthenticatedContext(options = {}) {
  const { appKey = null } = options;

  const session = await readSessionPayloadFromCookies();
  if (!session?.userId) {
    return { error: toErrorResponse("Authentication required", 401) };
  }

  const supabaseClient = getServerSupabaseClient();

  const userRecord = await getUserAccountById({
    userId: session.userId,
    supabaseClient,
  });

  if (!userRecord) {
    return { error: toErrorResponse("User not found for active session", 401) };
  }

  if (userRecord.is_active === false) {
    return { error: toErrorResponse("User account is inactive", 403) };
  }

  const statusRecord = await getUserStatusRecord(userRecord, supabaseClient);
  if (statusLooksInactive(statusRecord)) {
    return { error: toErrorResponse("User status does not allow access", 403) };
  }

  const access = await resolveUserRoleAccess({
    userId: userRecord[USER_MASTER_COLUMNS.userId],
    appKey: hasValue(appKey) ? appKey : null,
    supabaseClient,
  });

  return {
    session,
    userRecord,
    safeUser: sanitizeUserRecord(userRecord),
    statusRecord,
    access,
    supabaseClient,
  };
}

export async function requireActionPermission(options = {}) {
  const {
    action,
    appKey = null,
    rolePermissionMap = ADMIN_ROLE_PERMISSION_MAP,
  } = options;

  const contextResult = await getAuthenticatedContext({ appKey });
  if (contextResult.error) {
    return { error: contextResult.error };
  }

  try {
    const permission = await assertUserCanPerformAction({
      action,
      userId: contextResult.userRecord[USER_MASTER_COLUMNS.userId],
      appKey: hasValue(appKey) ? appKey : null,
      rolePermissionMap,
      supabaseClient: contextResult.supabaseClient,
    });

    return {
      context: contextResult,
      permission,
    };
  } catch (error) {
    return {
      error: toErrorResponse(error?.message || "Access denied", 403),
    };
  }
}

