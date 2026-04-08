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

async function assertCompanyExists(supabaseClient, companyId) {
  if (!hasValue(companyId)) {
    throw new Error("comp_id is required");
  }

  const { data, error } = await supabaseClient
    .from(USER_MASTER_TABLES.companies)
    .select(USER_MASTER_COLUMNS.companyId)
    .eq(USER_MASTER_COLUMNS.companyId, companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error(`Invalid comp_id: ${String(companyId)}`);
  }
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
    const companyId = searchParams.get("comp_id") || searchParams.get("compId");
    const includeInactive = searchParams.get("includeInactive") !== "false";

    let query = gate.context.supabaseClient
      .from(USER_MASTER_TABLES.departments)
      .select("*")
      .order(USER_MASTER_COLUMNS.departmentId, { ascending: true });

    if (hasValue(companyId)) {
      query = query.eq("comp_id", companyId);
    }

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const departments = data || [];
    return NextResponse.json({
      success: true,
      message: "Departments loaded",
      data: {
        departments,
      },
      departments,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to list departments", 500);
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
    const companyId = body?.comp_id ?? body?.compId;
    await assertCompanyExists(gate.context.supabaseClient, companyId);

    const payload = {
      ...body,
      comp_id: companyId,
    };
    delete payload.compId;

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.departments)
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Department created",
      data: {
        department: data,
      },
      department: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to create department", 500);
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
    const departmentId = body?.dept_id ?? body?.deptId;

    if (!hasValue(departmentId)) {
      return toErrorResponse("dept_id is required", 400);
    }

    const updates = { ...body };
    delete updates.dept_id;
    delete updates.deptId;

    const companyId = updates?.comp_id ?? updates?.compId;
    if (hasValue(companyId)) {
      await assertCompanyExists(gate.context.supabaseClient, companyId);
      updates.comp_id = companyId;
    }
    delete updates.compId;

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No department update fields were provided", 400);
    }

    const { data, error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.departments)
      .update(updates)
      .eq(USER_MASTER_COLUMNS.departmentId, departmentId)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Department updated",
      data: {
        department: data,
      },
      department: data,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update department", 500);
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
    const departmentId = searchParams.get("dept_id") || searchParams.get("deptId");

    if (!hasValue(departmentId)) {
      return toErrorResponse("dept_id is required", 400);
    }

    const { error } = await gate.context.supabaseClient
      .from(USER_MASTER_TABLES.departments)
      .delete()
      .eq(USER_MASTER_COLUMNS.departmentId, departmentId);

    if (error) {
      if (String(error?.code || "") === "23503") {
        return toErrorResponse("Cannot delete: record is in use", 409);
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Department removed",
      data: {
        dept_id: departmentId,
        deleted: true,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete department", 500);
  }
}
