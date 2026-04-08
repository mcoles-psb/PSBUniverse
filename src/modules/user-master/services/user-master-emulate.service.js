import { NextResponse } from "next/server";
import {
  resolveUserRoleAccess,
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import {
  ADMIN_ROLE_PERMISSION_MAP,
  requireActionPermission,
  sanitizeUserRecord,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";
import { writeSessionCookie } from "@/modules/user-master/session/user-master.session";
import { recordUserMasterAuditEvent } from "@/modules/user-master/services/user-master-audit.service";

const DEFAULT_ADMIN_APP_KEY =
  String(process.env.USER_MASTER_ADMIN_APP_KEY || "").trim() || "admin-config";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedAppKey = String(body?.appKey || "").trim() || DEFAULT_ADMIN_APP_KEY;
    const targetUserId = body?.user_id ?? body?.userId;

    if (!hasValue(targetUserId)) {
      return toErrorResponse("user_id is required", 400);
    }

    const gate = await requireActionPermission({
      action: "update",
      appKey: requestedAppKey,
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const actorUser = gate.context.userRecord;
    const actorUserId = actorUser?.[USER_MASTER_COLUMNS.userId];

    const { data: targetUser, error: targetError } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.users)
      .select("*")
      .eq(USER_MASTER_COLUMNS.userId, targetUserId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!targetUser) {
      return toErrorResponse("Target user not found", 404);
    }

    const targetAccess = await resolveUserRoleAccess({
      userId: targetUser[USER_MASTER_COLUMNS.userId],
      appKey: requestedAppKey,
      supabaseClient: gate.context.supabaseClient,
    });

    const existingSession = gate.context.session || {};
    const nowIso = new Date().toISOString();

    const originalUserId = hasValue(existingSession.originalUserId)
      ? String(existingSession.originalUserId)
      : String(actorUserId);

    const originalUsername = hasValue(existingSession.originalUsername)
      ? String(existingSession.originalUsername)
      : String(actorUser?.username || "").trim() || null;

    const sessionPayload = {
      userId: String(targetUser[USER_MASTER_COLUMNS.userId]),
      username: targetUser.username || null,
      email: targetUser.email || null,
      appKey: requestedAppKey,
      loginAt: nowIso,
      isEmulation: true,
      emulatedByUserId: String(actorUserId),
      emulatedByUsername: actorUser?.username || null,
      emulationStartedAt: nowIso,
      originalUserId,
      originalUsername,
    };

    const response = NextResponse.json({
      success: true,
      message: `Now emulating ${targetUser.username || targetUser.email || `User ${targetUserId}`}`,
      session: sessionPayload,
      user: sanitizeUserRecord(targetUser),
      access: targetAccess,
    });

    writeSessionCookie(response, sessionPayload);

    await recordUserMasterAuditEvent({
      supabaseClient: gate.context.supabaseClient,
      eventType: "auth.emulation.started",
      actorUserId,
      targetUserId: targetUser[USER_MASTER_COLUMNS.userId],
      appKey: requestedAppKey,
      metadata: {
        actorUsername: actorUser?.username || null,
        targetUsername: targetUser.username || null,
      },
    });

    return response;
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to emulate user", 500);
  }
}
