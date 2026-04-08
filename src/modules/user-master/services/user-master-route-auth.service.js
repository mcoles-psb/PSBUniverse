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

export const ADMIN_ROLE_PERMISSION_MAP = {
  admin: [...CRUD_ACTIONS],
};

const PRIVILEGED_GLOBAL_ROLE_KEYS = ["devmain"];
const DEFAULT_GLOBAL_ACCESS_APP_KEY =
  String(process.env.USER_MASTER_GLOBAL_APP_KEY || "").trim() || "psbuniverse";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
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
      success: false,
      message,
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

  const statusRecord = await getUserStatusRecord(userRecord, supabaseClient);
  const accountInactive = userRecord.is_active === false;
  const statusRestricted = statusLooksInactive(statusRecord);

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
    accountInactive,
    statusRestricted,
    supabaseClient,
  };
}

export async function requireActionPermission(options = {}) {
  const {
    action,
    appKey = null,
    rolePermissionMap = ADMIN_ROLE_PERMISSION_MAP,
    allowPrivilegedGlobalRoleBypass = rolePermissionMap === ADMIN_ROLE_PERMISSION_MAP,
    globalBypassAppKey = DEFAULT_GLOBAL_ACCESS_APP_KEY,
    requiredRoleKey = null,
  } = options;

  const normalizedRequiredRoleKey = hasValue(requiredRoleKey)
    ? String(requiredRoleKey).trim().toLowerCase()
    : null;

  const hasRequiredRole = (permission) => {
    if (!normalizedRequiredRoleKey) return true;

    if (normalizedRequiredRoleKey === "devmain" && permission?.isDevMain) {
      return true;
    }

    const roleKeys = Array.isArray(permission?.roleKeys)
      ? permission.roleKeys.map((value) => String(value || "").toLowerCase())
      : [];

    return roleKeys.includes(normalizedRequiredRoleKey);
  };

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

    if (!hasRequiredRole(permission)) {
      return {
        error: toErrorResponse(
          `Access denied: ${String(normalizedRequiredRoleKey || "required role").toUpperCase()} role required`,
          403
        ),
      };
    }

    return {
      context: contextResult,
      permission,
    };
  } catch (error) {
    const shouldTryGlobalBypass =
      Boolean(allowPrivilegedGlobalRoleBypass) && hasValue(appKey) && hasValue(globalBypassAppKey);

    if (shouldTryGlobalBypass) {
      try {
        const fallbackPermission = await assertUserCanPerformAction({
          action,
          userId: contextResult.userRecord[USER_MASTER_COLUMNS.userId],
          appKey: globalBypassAppKey,
          rolePermissionMap,
          supabaseClient: contextResult.supabaseClient,
        });

        const fallbackRoleKeys = Array.isArray(fallbackPermission?.roleKeys)
          ? fallbackPermission.roleKeys.map((value) => String(value || "").toLowerCase())
          : [];

        const hasPrivilegedRole =
          Boolean(fallbackPermission?.isDevMain) ||
          fallbackRoleKeys.some((roleKey) => PRIVILEGED_GLOBAL_ROLE_KEYS.includes(roleKey));

        if (hasPrivilegedRole) {
          if (!hasRequiredRole(fallbackPermission)) {
            return {
              error: toErrorResponse(
                `Access denied: ${String(normalizedRequiredRoleKey || "required role").toUpperCase()} role required`,
                403
              ),
            };
          }

          return {
            context: {
              ...contextResult,
              access: fallbackPermission,
            },
            permission: {
              ...fallbackPermission,
              usedGlobalRoleBypass: true,
              requestedAppKey: hasValue(appKey) ? String(appKey) : null,
              fallbackAppKey: String(globalBypassAppKey),
            },
          };
        }
      } catch {
        // Fallback denial uses the original error for clarity.
      }
    }

    if (normalizedRequiredRoleKey) {
      return {
        error: toErrorResponse(
          `Access denied: ${String(normalizedRequiredRoleKey).toUpperCase()} role required`,
          403
        ),
      };
    }

    return {
      error: toErrorResponse(error?.message || "Access denied", 403),
    };
  }
}

