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
    null
  );
}

export async function GET(request) {
  try {
    const gate = await requireActionPermission({
      action: "read",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .order(USER_MASTER_COLUMNS.roleId, { ascending: true });

    if (error) throw error;
    return NextResponse.json({ roles: data || [] });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list roles", 500);
  }
}

export async function POST(request) {
  try {
    const gate = await requireActionPermission({
      action: "create",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const body = await request.json();

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .insert(body)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ message: "Role created", role: data });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create role", 500);
  }
}

export async function PATCH(request) {
  try {
    const gate = await requireActionPermission({
      action: "update",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const roleId = body?.role_id ?? body?.roleId;

    if (!hasValue(roleId)) {
      return toErrorResponse("role_id is required", 400);
    }

    const updates = { ...body };
    delete updates.role_id;
    delete updates.roleId;

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No role update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.roleId, roleId)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ message: "Role updated", role: data });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update role", 500);
  }
}

export async function DELETE(request) {
  try {
    const gate = await requireActionPermission({
      action: "delete",
      appKey: getAdminAppKey(request),
      rolePermissionMap: ADMIN_ROLE_PERMISSION_MAP,
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("role_id") || searchParams.get("roleId");

    if (!hasValue(roleId)) {
      return toErrorResponse("role_id is required", 400);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .delete()
      .eq(USER_MASTER_COLUMNS.roleId, roleId);

    if (error) throw error;
    return NextResponse.json({ message: "Role deleted" });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete role", 500);
  }
}


