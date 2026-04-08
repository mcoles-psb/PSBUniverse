import { NextResponse } from "next/server";
import { USER_MASTER_COLUMNS, USER_MASTER_TABLES } from "@/modules/user-master/access/user-master.access";
import {
  ADMIN_ROLE_PERMISSION_MAP,
  requireActionPermission,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";
import { recordUserMasterAuditEvent } from "@/modules/user-master/services/user-master-audit.service";

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
    const userId = searchParams.get("user_id") || searchParams.get("userId");

    if (!hasValue(userId)) {
      return toErrorResponse("user_id is required", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.users)
      .select(`${USER_MASTER_COLUMNS.userId}, username, email, password_hash`)
      .eq(USER_MASTER_COLUMNS.userId, userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return toErrorResponse("User not found", 404);
    }

    await recordUserMasterAuditEvent({
      supabaseClient: gate.context.supabaseClient,
      eventType: "auth.password.hash_viewed",
      actorUserId: gate.context.userRecord?.[USER_MASTER_COLUMNS.userId],
      targetUserId: data[USER_MASTER_COLUMNS.userId],
      appKey,
      metadata: {
        targetUsername: data.username || null,
      },
    });

    const response = NextResponse.json({
      success: true,
      message: "Password hash loaded",
      data: {
        user_id: data[USER_MASTER_COLUMNS.userId],
        username: data.username || null,
        email: data.email || null,
        password_hash: data.password_hash || "",
        hash_algorithm: "bcrypt",
        reversible: false,
      },
      password_hash: data.password_hash || "",
    });

    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load password hash", 500);
  }
}
