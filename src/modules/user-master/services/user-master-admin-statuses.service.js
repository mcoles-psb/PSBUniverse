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
      requiredRoleKey: "devmain",
    });

    if (gate.error) return gate.error;

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.statuses)
      .select("*")
      .like("sts_desc", "psb_%")
      .order(USER_MASTER_COLUMNS.statusId, { ascending: true });

    if (error) throw error;

    const statuses = data || [];
    return NextResponse.json({
      success: true,
      message: "Statuses loaded",
      data: {
        statuses,
      },
      statuses,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list statuses", 500);
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

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.statuses)
      .insert(body)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Status created",
      data: {
        status: data,
      },
      status: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create status", 500);
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
    const statusId = body?.status_id ?? body?.statusId;

    if (!hasValue(statusId)) {
      return toErrorResponse("status_id is required", 400);
    }

    const updates = { ...body };
    delete updates.status_id;
    delete updates.statusId;

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No status update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.statuses)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.statusId, statusId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Status updated",
      data: {
        status: data,
      },
      status: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update status", 500);
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
    const statusId = searchParams.get("status_id") || searchParams.get("statusId");

    if (!hasValue(statusId)) {
      return toErrorResponse("status_id is required", 400);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.statuses)
      .delete()
      .eq(USER_MASTER_COLUMNS.statusId, statusId);

    if (error) {
      if (String(error?.code || "") === "23503") {
        return toErrorResponse("Cannot delete: record is in use", 409);
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Status removed",
      data: {
        status_id: statusId,
        deleted: true,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete status", 500);
  }
}
