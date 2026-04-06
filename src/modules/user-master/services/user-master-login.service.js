import { NextResponse } from "next/server";
import {
  resolveUserRoleAccess,
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import { verifyPasswordHash } from "@/core/security/password.security";
import { getServerSupabaseClient } from "@/infrastructure/supabase/server";
import { sanitizeUserRecord, toErrorResponse } from "@/modules/user-master/services/user-master-route-auth.service";
import { writeSessionCookie } from "@/modules/user-master/session/user-master.session";

const STATUS_TEXT_FIELDS = [
  "status_name",
  "name",
  "code",
  "status_code",
  "label",
  "slug",
  "key",
];

const BLOCKED_STATUS_HINTS = [
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

async function findUserByIdentifier(supabaseClient, identifier) {
  const normalizedIdentifier = String(identifier || "").trim();

  const usernameQuery = await supabaseClient
    .from(USER_MASTER_TABLES.users)
    .select("*")
    .eq("username", normalizedIdentifier)
    .maybeSingle();

  if (usernameQuery.error) throw usernameQuery.error;
  if (usernameQuery.data) return usernameQuery.data;

  const emailQuery = await supabaseClient
    .from(USER_MASTER_TABLES.users)
    .select("*")
    .eq("email", normalizedIdentifier)
    .maybeSingle();

  if (emailQuery.error) throw emailQuery.error;
  return emailQuery.data || null;
}

async function getStatusRecord(supabaseClient, statusId) {
  if (!hasValue(statusId)) return null;

  const { data, error } = await supabaseClient
    .from(USER_MASTER_TABLES.statuses)
    .select("*")
    .eq(USER_MASTER_COLUMNS.statusId, statusId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function isBlockedStatus(statusRecord) {
  if (!statusRecord || typeof statusRecord !== "object") return false;

  const text = STATUS_TEXT_FIELDS.map((field) => statusRecord[field])
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  if (!text) return false;
  return BLOCKED_STATUS_HINTS.some((hint) => text.includes(hint));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const identifier = String(body?.identifier || body?.username || body?.email || "").trim();
    const password = String(body?.password || "");
    const requestedAppKey = String(body?.appKey || "").trim() || null;

    if (!identifier || !password) {
      return toErrorResponse("identifier and password are required", 400);
    }

    const supabaseClient = getServerSupabaseClient();
    const userRecord = await findUserByIdentifier(supabaseClient, identifier);

    if (!userRecord) {
      return toErrorResponse("Invalid username/email or password", 401);
    }

    const isPasswordValid = await verifyPasswordHash(password, userRecord.password_hash);
    if (!isPasswordValid) {
      return toErrorResponse("Invalid username/email or password", 401);
    }

    if (userRecord.is_active === false) {
      return toErrorResponse("User account is inactive", 403);
    }

    const statusRecord = await getStatusRecord(
      supabaseClient,
      userRecord[USER_MASTER_COLUMNS.statusId]
    );

    if (isBlockedStatus(statusRecord)) {
      return toErrorResponse("User status does not allow login", 403);
    }

    const access = await resolveUserRoleAccess({
      userId: userRecord[USER_MASTER_COLUMNS.userId],
      appKey: requestedAppKey,
      supabaseClient,
    });

    if (!access.hasAccess) {
      return toErrorResponse(
        "No role/application access mapping found for this user",
        403
      );
    }

    const sessionPayload = {
      userId: String(userRecord[USER_MASTER_COLUMNS.userId]),
      username: userRecord.username || null,
      email: userRecord.email || null,
      appKey: requestedAppKey,
      loginAt: new Date().toISOString(),
    };

    const response = NextResponse.json({
      message: "Login successful",
      session: sessionPayload,
      user: sanitizeUserRecord(userRecord),
      access,
      status: statusRecord,
    });

    writeSessionCookie(response, sessionPayload);
    return response;
  } catch (error) {
    return toErrorResponse(error?.message || "Login failed", 500);
  }
}


