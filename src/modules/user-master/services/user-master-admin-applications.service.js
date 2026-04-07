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
      .from(USER_MASTER_TABLES.applications)
      .select("*")
      .order(USER_MASTER_COLUMNS.appId, { ascending: true });

    if (error) throw error;
    const applications = data || [];
    return NextResponse.json({
      success: true,
      message: "Applications loaded",
      data: {
        applications,
      },
      applications,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list applications", 500);
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
      .from(USER_MASTER_TABLES.applications)
      .insert(body)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({
      success: true,
      message: "Application created",
      data: {
        application: data,
      },
      application: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create application", 500);
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
    const appId = body?.app_id ?? body?.appId;

    if (!hasValue(appId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const updates = { ...body };
    delete updates.app_id;
    delete updates.appId;

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No application update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.applications)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.appId, appId)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({
      success: true,
      message: "Application updated",
      data: {
        application: data,
      },
      application: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update application", 500);
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
    const appId = searchParams.get("app_id") || searchParams.get("appId");

    if (!hasValue(appId)) {
      return toErrorResponse("app_id is required", 400);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.applications)
      .delete()
      .eq(USER_MASTER_COLUMNS.appId, appId);

    if (error) throw error;
    return NextResponse.json({
      success: true,
      message: "Application deleted",
      data: {
        app_id: appId,
        deleted: true,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete application", 500);
  }
}


