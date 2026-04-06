import { NextResponse } from "next/server";
import { USER_MASTER_TABLES } from "@/modules/user-master/access/user-master.access";
import {
  getAuthenticatedContext,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

async function selectAll(supabaseClient, tableName, orderByColumn) {
  let query = supabaseClient.from(tableName).select("*");

  if (orderByColumn) {
    query = query.order(orderByColumn, { ascending: true });
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function GET() {
  try {
    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;

    if (!auth.access.hasAccess) {
      return toErrorResponse("No role/application mapping found for user", 403);
    }

    const [companies, departments, statuses, roles, applications] =
      await Promise.all([
        selectAll(auth.supabaseClient, USER_MASTER_TABLES.companies, "comp_id"),
        selectAll(auth.supabaseClient, USER_MASTER_TABLES.departments, "dept_id"),
        selectAll(auth.supabaseClient, USER_MASTER_TABLES.statuses, "status_id"),
        selectAll(auth.supabaseClient, USER_MASTER_TABLES.roles, "role_id"),
        selectAll(auth.supabaseClient, USER_MASTER_TABLES.applications, "app_id"),
      ]);

    return NextResponse.json({
      companies,
      departments,
      statuses,
      roles,
      applications,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load reference data", 500);
  }
}


