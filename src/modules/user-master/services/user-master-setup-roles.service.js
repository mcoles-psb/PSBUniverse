import { NextResponse } from "next/server";
import {
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import {
  ADMIN_ROLE_PERMISSION_MAP,
  requireActionPermission,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getAdminAppKey(request) {
  const { searchParams } = new URL(request.url);
  return (
    String(searchParams.get("appKey") || "").trim() ||
    String(process.env.USER_MASTER_ADMIN_APP_KEY || "").trim() ||
    "admin-config"
  );
}

export async function GET(request) {
  try {
    const gate = await requireActionPermission({
      action: "read",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("app_id") || searchParams.get("appId");

    if (!hasValue(appId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .eq(USER_MASTER_COLUMNS.appId, appId)
      .order(USER_MASTER_COLUMNS.roleId, { ascending: true });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load setup roles", 500);
  }
}
