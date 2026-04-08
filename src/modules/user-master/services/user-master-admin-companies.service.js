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
      .from(USER_MASTER_TABLES.companies)
      .select("*")
      .order(USER_MASTER_COLUMNS.companyId, { ascending: true });

    if (error) throw error;

    const companies = data || [];
    return NextResponse.json({
      success: true,
      message: "Companies loaded",
      data: {
        companies,
      },
      companies,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list companies", 500);
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
      .from(USER_MASTER_TABLES.companies)
      .insert(body)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Company created",
      data: {
        company: data,
      },
      company: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create company", 500);
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
    const companyId = body?.comp_id ?? body?.compId;

    if (!hasValue(companyId)) {
      return toErrorResponse("comp_id is required", 400);
    }

    const updates = { ...body };
    delete updates.comp_id;
    delete updates.compId;

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No company update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.companies)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.companyId, companyId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Company updated",
      data: {
        company: data,
      },
      company: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update company", 500);
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
    const companyId = searchParams.get("comp_id") || searchParams.get("compId");

    if (!hasValue(companyId)) {
      return toErrorResponse("comp_id is required", 400);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.companies)
      .delete()
      .eq(USER_MASTER_COLUMNS.companyId, companyId);

    if (error) {
      if (String(error?.code || "") === "23503") {
        return toErrorResponse("Cannot delete: record is in use", 409);
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Company removed",
      data: {
        comp_id: companyId,
        deleted: true,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete company", 500);
  }
}
