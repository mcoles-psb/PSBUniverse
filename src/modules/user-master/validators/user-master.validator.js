import {
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

async function fetchById(supabaseClient, tableName, idColumn, value) {
  if (!hasValue(value)) return null;

  const { data, error } = await supabaseClient
    .from(tableName)
    .select("*")
    .eq(idColumn, value)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function assertUserReferencesValid(supabaseClient, references = {}) {
  const {
    comp_id: companyId,
    dept_id: departmentId,
    status_id: statusId,
    existingCompanyId,
  } = references;

  const [companyRecord, departmentRecord, statusRecord] = await Promise.all([
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.companies,
      USER_MASTER_COLUMNS.companyId,
      companyId
    ),
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.departments,
      USER_MASTER_COLUMNS.departmentId,
      departmentId
    ),
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.statuses,
      USER_MASTER_COLUMNS.statusId,
      statusId
    ),
  ]);

  if (hasValue(companyId) && !companyRecord) {
    throw new Error(`Invalid comp_id: ${String(companyId)}`);
  }

  if (hasValue(departmentId) && !departmentRecord) {
    throw new Error(`Invalid dept_id: ${String(departmentId)}`);
  }

  if (hasValue(statusId) && !statusRecord) {
    throw new Error(`Invalid status_id: ${String(statusId)}`);
  }

  const effectiveCompanyId = hasValue(companyId) ? companyId : existingCompanyId;

  if (hasValue(departmentId) && hasValue(effectiveCompanyId)) {
    if (String(departmentRecord.comp_id) !== String(effectiveCompanyId)) {
      throw new Error(
        `Department ${String(departmentId)} is not linked to company ${String(
          effectiveCompanyId
        )}`
      );
    }
  }

  return {
    company: companyRecord,
    department: departmentRecord,
    status: statusRecord,
  };
}

export async function assertMappingReferencesValid(supabaseClient, references = {}) {
  const {
    user_id: userId,
    role_id: roleId,
    app_id: appId,
  } = references;

  const [userRecord, roleRecord, appRecord] = await Promise.all([
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.users,
      USER_MASTER_COLUMNS.userId,
      userId
    ),
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.roles,
      USER_MASTER_COLUMNS.roleId,
      roleId
    ),
    fetchById(
      supabaseClient,
      USER_MASTER_TABLES.applications,
      USER_MASTER_COLUMNS.appId,
      appId
    ),
  ]);

  if (!userRecord) {
    throw new Error(`Invalid user_id: ${String(userId)}`);
  }

  if (!roleRecord) {
    throw new Error(`Invalid role_id: ${String(roleId)}`);
  }

  if (!appRecord) {
    throw new Error(`Invalid app_id: ${String(appId)}`);
  }

  if (
    hasValue(roleRecord?.[USER_MASTER_COLUMNS.appId]) &&
    String(roleRecord[USER_MASTER_COLUMNS.appId]) !== String(appId)
  ) {
    throw new Error(
      `Role ${String(roleId)} does not belong to application ${String(appId)}`
    );
  }

  return {
    user: userRecord,
    role: roleRecord,
    application: appRecord,
  };
}
