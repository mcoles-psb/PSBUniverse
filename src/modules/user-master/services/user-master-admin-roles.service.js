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

const APP_CARD_ROLE_ACCESS_TABLE =
  String(process.env.USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE || "").trim() || "psb_m_appcardroleaccess";

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
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("app_id") || searchParams.get("appId");

    let query = gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .order(USER_MASTER_COLUMNS.roleId, { ascending: true });

    if (hasValue(appId)) {
      query = query.eq(USER_MASTER_COLUMNS.appId, appId);
    }

    const { data, error } = await query;

    if (error) throw error;
    const roles = data || [];
    return NextResponse.json({
      success: true,
      message: "Roles loaded",
      data: {
        roles,
      },
      roles,
    });
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
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const roleName = String(body?.role_name || "").trim();
    const appId = body?.app_id ?? body?.appId;

    if (!hasValue(roleName)) {
      return toErrorResponse("role_name is required", 400);
    }

    if (!hasValue(appId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const payload = {
      role_name: roleName,
      role_desc: String(body?.role_desc || "").trim() || null,
      app_id: appId,
      is_active: body?.is_active !== false,
    };

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      if (String(error?.code || "") === "23505") {
        return toErrorResponse("Role name must be unique per application", 409);
      }
      throw error;
    }
    return NextResponse.json({
      success: true,
      message: "Role created",
      data: {
        role: data,
      },
      role: data,
    });
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
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const body = await request.json();
    const roleId = body?.role_id ?? body?.roleId;

    if (!hasValue(roleId)) {
      return toErrorResponse("role_id is required", 400);
    }

    const { data: existingRole, error: existingRoleError } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .eq(USER_MASTER_COLUMNS.roleId, roleId)
      .maybeSingle();

    if (existingRoleError) throw existingRoleError;
    if (!existingRole) {
      return toErrorResponse("Role not found", 404);
    }

    const updates = { ...body };
    delete updates.role_id;
    delete updates.roleId;

    if (Object.prototype.hasOwnProperty.call(updates, "appId")) {
      updates.app_id = updates.appId;
      delete updates.appId;
    }

    if (Object.prototype.hasOwnProperty.call(updates, USER_MASTER_COLUMNS.appId)) {
      const requestedAppId = String(updates[USER_MASTER_COLUMNS.appId] || "").trim();
      const existingAppId = String(existingRole?.[USER_MASTER_COLUMNS.appId] || "").trim();
      if (hasValue(requestedAppId) && requestedAppId !== existingAppId) {
        return toErrorResponse("app_id cannot be changed for an existing role", 409);
      }

      delete updates[USER_MASTER_COLUMNS.appId];
    }

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No role update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.roleId, roleId)
      .select("*")
      .single();

    if (error) {
      if (String(error?.code || "") === "23505") {
        return toErrorResponse("Role name must be unique per application", 409);
      }
      throw error;
    }
    return NextResponse.json({
      success: true,
      message: "Role updated",
      data: {
        role: data,
      },
      role: data,
    });
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
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("role_id") || searchParams.get("roleId");

    if (!hasValue(roleId)) {
      return toErrorResponse("role_id is required", 400);
    }

    const { count: userMappingCount, error: userMappingError } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.userAppRoleAccess)
      .select("uar_id", { count: "exact", head: true })
      .eq(USER_MASTER_COLUMNS.roleId, roleId);

    if (userMappingError) throw userMappingError;

    const { count: cardRoleCount, error: cardRoleError } = await gate.context.supabaseClient
      .from(APP_CARD_ROLE_ACCESS_TABLE)
      .select("acr_id", { count: "exact", head: true })
      .eq(USER_MASTER_COLUMNS.roleId, roleId);

    if (cardRoleError) throw cardRoleError;

    if (Number(userMappingCount || 0) > 0 || Number(cardRoleCount || 0) > 0) {
      return toErrorResponse("Cannot delete role. It is currently in use.", 409);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .delete()
      .eq(USER_MASTER_COLUMNS.roleId, roleId);

    if (error) {
      if (String(error?.code || "") === "23503") {
        return toErrorResponse("Cannot delete: record is in use", 409);
      }

      throw error;
    }
    return NextResponse.json({
      success: true,
      message: "Role deleted",
      data: {
        role_id: roleId,
        deleted: true,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete role", 500);
  }
}


