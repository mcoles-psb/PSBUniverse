import { NextResponse } from "next/server";
import {
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import {
  getAuthenticatedContext,
  sanitizeUserRecord,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "f" || text === "n" || text === "no";
}

function isRowActive(row) {
  return !isInactiveFlag(row?.is_active);
}

function getDisplayLabel(record, candidates, fallback) {
  for (const field of candidates) {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

async function loadProfileRelations(supabaseClient, userRecord) {
  const [companyRes, departmentRes, statusRes] = await Promise.all([
    hasValue(userRecord?.comp_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.companies)
          .select("*")
          .eq("comp_id", userRecord.comp_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(userRecord?.dept_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.departments)
          .select("*")
          .eq("dept_id", userRecord.dept_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(userRecord?.status_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.statuses)
          .select("*")
          .eq("status_id", userRecord.status_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (companyRes.error) throw companyRes.error;
  if (departmentRes.error) throw departmentRes.error;
  if (statusRes.error) throw statusRes.error;

  return {
    company: companyRes.data || null,
    department: departmentRes.data || null,
    status: statusRes.data || null,
  };
}

async function loadRoleGroupsByApp(supabaseClient, userRecord) {
  if (!hasValue(userRecord?.user_id)) {
    return [];
  }

  const { data: mappingRows, error: mappingError } = await supabaseClient
    .from(USER_MASTER_TABLES.userAppRoleAccess)
    .select("*")
    .eq(USER_MASTER_COLUMNS.userId, userRecord.user_id);

  if (mappingError) throw mappingError;

  const mappings = Array.isArray(mappingRows)
    ? mappingRows.filter((mapping) => isRowActive(mapping))
    : [];
  if (mappings.length === 0) {
    return [];
  }

  const uniqueRoleIds = Array.from(
    new Set(
      mappings
        .map((mapping) => mapping?.[USER_MASTER_COLUMNS.roleId])
        .filter((value) => hasValue(value))
        .map((value) => String(value))
    )
  );

  const uniqueAppIds = Array.from(
    new Set(
      mappings
        .map((mapping) => mapping?.[USER_MASTER_COLUMNS.appId])
        .filter((value) => hasValue(value))
        .map((value) => String(value))
    )
  );

  if (uniqueRoleIds.length === 0 || uniqueAppIds.length === 0) {
    return [];
  }

  const [roleResponse, appResponse] = await Promise.all([
    supabaseClient
      .from(USER_MASTER_TABLES.roles)
      .select("*")
      .in(USER_MASTER_COLUMNS.roleId, uniqueRoleIds),
    supabaseClient
      .from(USER_MASTER_TABLES.applications)
      .select("*")
      .in(USER_MASTER_COLUMNS.appId, uniqueAppIds),
  ]);

  const roleRecords = Array.isArray(roleResponse?.data) ? roleResponse.data : [];
  const appRecords = Array.isArray(appResponse?.data) ? appResponse.data : [];

  const roleById = new Map(
    roleRecords
      .filter((role) => isRowActive(role))
      .map((role) => [String(role[USER_MASTER_COLUMNS.roleId]), role])
  );

  const appById = new Map(
    appRecords
      .filter((application) => isRowActive(application))
      .map((application) => [String(application[USER_MASTER_COLUMNS.appId]), application])
  );

  const groupedByAppId = new Map();

  mappings.forEach((mapping) => {
    const appId = String(mapping?.[USER_MASTER_COLUMNS.appId] || "");
    const roleId = String(mapping?.[USER_MASTER_COLUMNS.roleId] || "");

    const app = appById.get(appId);
    const role = roleById.get(roleId);

    if (!groupedByAppId.has(appId)) {
      groupedByAppId.set(appId, {
        appId,
        appName: app
          ? getDisplayLabel(app, ["app_name", "name", "label", "app_code", "code"], `App ${appId}`)
          : `App ${appId}`,
        roles: [],
      });
    }

    const appEntry = groupedByAppId.get(appId);
    const roleName = role
      ? getDisplayLabel(role, ["role_name", "name", "label", "code"], `Role ${roleId}`)
      : `Role ${roleId}`;

    if (!appEntry.roles.some((item) => item.roleId === roleId)) {
      appEntry.roles.push({
        roleId,
        roleName,
      });
    }
  });

  return Array.from(groupedByAppId.values())
    .map((group) => ({
      ...group,
      roles: group.roles.sort((a, b) => a.roleName.localeCompare(b.roleName)),
    }))
    .sort((a, b) => a.appName.localeCompare(b.appName));
}

export async function GET() {
  try {
    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;

    const [relations, roleGroupsByApp] = await Promise.all([
      loadProfileRelations(auth.supabaseClient, auth.userRecord),
      loadRoleGroupsByApp(auth.supabaseClient, auth.userRecord),
    ]);

    return NextResponse.json({
      user: sanitizeUserRecord(auth.userRecord),
      relations: {
        ...relations,
        roleGroupsByApp,
      },
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load user profile", 500);
  }
}

export async function PATCH(request) {
  try {
    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;
    return toErrorResponse(
      "Profile and password changes are available only in Configuration & Settings. Please email your administrator.",
      403
    );
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to process profile request", 500);
  }
}


