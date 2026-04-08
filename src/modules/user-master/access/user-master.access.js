import { supabase } from "@/infrastructure/supabase/client";

export const USER_MASTER_TABLES = {
  users: "psb_s_user",
  companies: "psb_s_company",
  departments: "psb_s_department",
  roles: "psb_s_role",
  applications: "psb_s_application",
  statuses: "psb_s_status",
  userAppRoleAccess: "psb_m_userapproleaccess",
};

export const USER_MASTER_COLUMNS = {
  userId: "user_id",
  companyId: "comp_id",
  departmentId: "dept_id",
  statusId: "status_id",
  roleId: "role_id",
  appId: "app_id",
};

export const CRUD_ACTIONS = ["create", "read", "update", "delete"];
export const DEVMAIN_ROLE_KEY = "devmain";

const DEFAULT_ROLE_FIELD_CANDIDATES = ["role_name", "name", "code", "slug", "key"];
const DEFAULT_APP_FIELD_CANDIDATES = ["app_code", "code", "app_name", "name", "slug", "key"];

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "f" || text === "n" || text === "no";
}

function isRowActive(record) {
  return !isInactiveFlag(record?.is_active);
}

function normalizeKeyToken(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function collectNormalizedKeys(record, candidates) {
  const values = [];

  (candidates || []).forEach((field) => {
    const value = record?.[field];
    if (typeof value === "string" && value.trim()) {
      values.push(value);
    }
  });

  return uniqueValues(
    values.flatMap((value) => {
      const normalized = normalizeText(value);
      const token = normalizeKeyToken(value);
      return [normalized, token].filter(Boolean);
    })
  );
}

function pickFirstStringValue(record, candidates) {
  if (!record || typeof record !== "object") return "";

  for (const field of candidates || []) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "";
}

function mergeConfig(baseConfig, overrideConfig) {
  return {
    ...baseConfig,
    ...(overrideConfig || {}),
  };
}

function withoutUndefinedEntries(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([, value]) => value !== undefined)
  );
}

function uniqueValues(values) {
  return Array.from(new Set((values || []).filter(hasValue).map((value) => String(value))));
}

function emptyPermissions() {
  return {
    create: false,
    read: false,
    update: false,
    delete: false,
  };
}

function fullPermissions() {
  return {
    create: true,
    read: true,
    update: true,
    delete: true,
  };
}

function normalizeAction(value) {
  return normalizeText(value);
}

function coercePermissionValue(permissionConfig) {
  const output = emptyPermissions();

  if (permissionConfig === true) {
    return fullPermissions();
  }

  if (Array.isArray(permissionConfig)) {
    permissionConfig.forEach((actionName) => {
      const action = normalizeAction(actionName);
      if (CRUD_ACTIONS.includes(action)) output[action] = true;
    });
    return output;
  }

  if (permissionConfig && typeof permissionConfig === "object") {
    CRUD_ACTIONS.forEach((action) => {
      if (permissionConfig[action] === true) {
        output[action] = true;
      }
    });
  }

  return output;
}

function mergePermissionMaps(basePermissions, nextPermissions) {
  const merged = {
    ...basePermissions,
  };

  CRUD_ACTIONS.forEach((action) => {
    if (nextPermissions?.[action]) {
      merged[action] = true;
    }
  });

  return merged;
}

function resolvePermissionsFromRoles(roleKeys, rolePermissionMap) {
  const normalizedMap = rolePermissionMap || {};
  const allRolesConfig = coercePermissionValue(normalizedMap["*"]);

  return (roleKeys || []).reduce((permissions, roleKey) => {
    const normalizedRoleKey = normalizeText(roleKey);
    const roleConfig = coercePermissionValue(normalizedMap[normalizedRoleKey]);
    return mergePermissionMaps(permissions, roleConfig);
  }, allRolesConfig);
}

function getRoleKey(roleRecord, roleFieldCandidates) {
  return normalizeText(pickFirstStringValue(roleRecord, roleFieldCandidates));
}

function getAppKey(appRecord, appFieldCandidates) {
  return normalizeText(pickFirstStringValue(appRecord, appFieldCandidates));
}

async function fetchRolesByIds({ supabaseClient, tableName, roleIdColumn, roleIds }) {
  if (!Array.isArray(roleIds) || roleIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient.from(tableName).select("*").in(roleIdColumn, roleIds);
  if (error) throw error;
  return data || [];
}

async function fetchAppsByIds({ supabaseClient, tableName, appIdColumn, appIds }) {
  if (!Array.isArray(appIds) || appIds.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient.from(tableName).select("*").in(appIdColumn, appIds);
  if (error) throw error;
  return data || [];
}

export async function listUserAccounts(config = {}) {
  const {
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
    filters = {},
    includeInactive = true,
    limit,
    orderBy = "updated_at",
    ascending = false,
  } = config;

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);

  let query = supabaseClient.from(tables.users).select("*");

  if (hasValue(filters.companyId)) {
    query = query.eq(columns.companyId, filters.companyId);
  }

  if (hasValue(filters.departmentId)) {
    query = query.eq(columns.departmentId, filters.departmentId);
  }

  if (hasValue(filters.statusId)) {
    query = query.eq(columns.statusId, filters.statusId);
  }

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  if (hasValue(orderBy)) {
    query = query.order(orderBy, { ascending });
  }

  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    query = query.limit(Number(limit));
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getUserAccountById(config = {}) {
  const {
    userId,
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  if (!hasValue(userId)) {
    throw new Error("userId is required for getUserAccountById");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);

  const { data, error } = await supabaseClient
    .from(tables.users)
    .select("*")
    .eq(columns.userId, userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function createUserAccount(config = {}) {
  const {
    payload,
    actorUserId,
    supabaseClient = supabase,
    tableOverrides,
  } = config;

  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required for createUserAccount");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const nowIso = new Date().toISOString();

  const row = {
    ...payload,
    created_at: payload.created_at ?? nowIso,
    updated_at: payload.updated_at ?? nowIso,
    created_by: payload.created_by ?? actorUserId ?? null,
    updated_by: payload.updated_by ?? actorUserId ?? null,
    is_active: payload.is_active ?? true,
  };

  const { data, error } = await supabaseClient.from(tables.users).insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateUserAccount(config = {}) {
  const {
    userId,
    updates,
    actorUserId,
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  if (!hasValue(userId)) {
    throw new Error("userId is required for updateUserAccount");
  }

  if (!updates || typeof updates !== "object") {
    throw new Error("updates is required for updateUserAccount");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);

  const row = {
    ...updates,
    updated_at: updates.updated_at ?? new Date().toISOString(),
    updated_by: updates.updated_by ?? actorUserId ?? null,
  };

  const { data, error } = await supabaseClient
    .from(tables.users)
    .update(row)
    .eq(columns.userId, userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function upsertUserAppRoleAccess(config = {}) {
  const {
    userId,
    roleId,
    appId,
    actorUserId,
    additionalFields = {},
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  if (!hasValue(userId) || !hasValue(roleId) || !hasValue(appId)) {
    throw new Error("userId, roleId, and appId are required for upsertUserAppRoleAccess");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);
  const nowIso = new Date().toISOString();

  const row = withoutUndefinedEntries({
    [columns.userId]: userId,
    [columns.roleId]: roleId,
    [columns.appId]: appId,
    ...additionalFields,
    updated_at: additionalFields.updated_at ?? nowIso,
    updated_by: additionalFields.updated_by ?? actorUserId ?? null,
    // Preserve existing creation metadata on update unless explicitly provided.
    created_by: additionalFields.created_by,
    created_at: additionalFields.created_at,
  });

  const onConflict = [columns.userId, columns.roleId, columns.appId].join(",");

  const { data, error } = await supabaseClient
    .from(tables.userAppRoleAccess)
    .upsert(row, { onConflict })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function removeUserAppRoleAccess(config = {}) {
  const {
    userId,
    roleId,
    appId,
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  if (!hasValue(userId) || !hasValue(roleId) || !hasValue(appId)) {
    throw new Error("userId, roleId, and appId are required for removeUserAppRoleAccess");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);

  const { error } = await supabaseClient
    .from(tables.userAppRoleAccess)
    .delete()
    .eq(columns.userId, userId)
    .eq(columns.roleId, roleId)
    .eq(columns.appId, appId);

  if (error) throw error;
  return true;
}

export async function resolveUserRoleAccess(config = {}) {
  const {
    userId,
    appId,
    appKey,
    rolePermissionMap = {},
    defaultCrudForMappedRole = false,
    roleFieldCandidates = DEFAULT_ROLE_FIELD_CANDIDATES,
    appFieldCandidates = DEFAULT_APP_FIELD_CANDIDATES,
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  if (!hasValue(userId)) {
    throw new Error("userId is required for resolveUserRoleAccess");
  }

  const tables = mergeConfig(USER_MASTER_TABLES, tableOverrides);
  const columns = mergeConfig(USER_MASTER_COLUMNS, columnOverrides);
  const normalizedAppKey = normalizeText(appKey);
  const normalizedAppKeyToken = normalizeKeyToken(appKey);

  const { data: mappings, error: mappingsError } = await supabaseClient
    .from(tables.userAppRoleAccess)
    .select("*")
    .eq(columns.userId, userId);

  if (mappingsError) throw mappingsError;

  const allMappingsRaw = mappings || [];
  const activeMappings = allMappingsRaw.filter((mapping) => isRowActive(mapping));
  const mappedRoleIds = uniqueValues(activeMappings.map((row) => row[columns.roleId]));
  const mappedAppIds = uniqueValues(activeMappings.map((row) => row[columns.appId]));

  const roleRecords = await fetchRolesByIds({
    supabaseClient,
    tableName: tables.roles,
    roleIdColumn: columns.roleId,
    roleIds: mappedRoleIds,
  });

  const appRecords = await fetchAppsByIds({
    supabaseClient,
    tableName: tables.applications,
    appIdColumn: columns.appId,
    appIds: mappedAppIds,
  });

  const activeRoleRecords = roleRecords.filter((roleRecord) => isRowActive(roleRecord));
  const activeAppRecords = appRecords.filter((appRecord) => isRowActive(appRecord));

  const roleById = new Map(activeRoleRecords.map((role) => [String(role[columns.roleId]), role]));
  const appById = new Map(activeAppRecords.map((app) => [String(app[columns.appId]), app]));
  const devmainRoleIds = new Set(
    activeRoleRecords
      .filter((roleRecord) => getRoleKey(roleRecord, roleFieldCandidates) === DEVMAIN_ROLE_KEY)
      .map((roleRecord) => String(roleRecord[columns.roleId]))
  );

  const allMappings = activeMappings.filter((mapping) => {
    const roleIdValue = String(mapping[columns.roleId]);
    const appIdValue = String(mapping[columns.appId]);
    return roleById.has(roleIdValue) && appById.has(appIdValue);
  });

  const isDevMain = allMappings.some((mapping) => devmainRoleIds.has(String(mapping[columns.roleId])));

  let resolvedAppId = hasValue(appId) ? String(appId) : null;

  if (!resolvedAppId && normalizedAppKey) {
    const matchingApp = activeAppRecords.find((appRecord) => {
      const appKeys = collectNormalizedKeys(appRecord, appFieldCandidates);
      return appKeys.includes(normalizedAppKey) || appKeys.includes(normalizedAppKeyToken);
    });

    if (matchingApp && hasValue(matchingApp[columns.appId])) {
      resolvedAppId = String(matchingApp[columns.appId]);
    }
  }

  const hasAppScope = hasValue(appId) || Boolean(normalizedAppKey);

  const relevantMappings = allMappings.filter((mapping) => {
    if (!resolvedAppId) return !normalizedAppKey;
    return String(mapping[columns.appId]) === resolvedAppId;
  });

  const hasAccess = hasAppScope ? relevantMappings.length > 0 : isDevMain || relevantMappings.length > 0;

  const roleKeysForContext = uniqueValues(
    relevantMappings
      .map((mapping) => roleById.get(String(mapping[columns.roleId])))
      .filter(Boolean)
      .map((roleRecord) => getRoleKey(roleRecord, roleFieldCandidates))
  );

  const appKeysForContext = uniqueValues(
    relevantMappings
      .map((mapping) => appById.get(String(mapping[columns.appId])))
      .filter(Boolean)
      .map((appRecord) => getAppKey(appRecord, appFieldCandidates))
  );

  const appKeyTokensForContext = uniqueValues(
    relevantMappings
      .map((mapping) => appById.get(String(mapping[columns.appId])))
      .filter(Boolean)
      .flatMap((appRecord) => collectNormalizedKeys(appRecord, appFieldCandidates))
  );

  let permissions = emptyPermissions();

  if (isDevMain && hasAccess) {
    permissions = fullPermissions();
  } else {
    permissions = {
      ...permissions,
      read: hasAccess,
    };

    if (defaultCrudForMappedRole && hasAccess) {
      permissions = fullPermissions();
    }

    const mappedPermissions = resolvePermissionsFromRoles(roleKeysForContext, rolePermissionMap);
    permissions = mergePermissionMaps(permissions, mappedPermissions);
  }

  return {
    userId: String(userId),
    requestedAppId: hasValue(appId) ? String(appId) : null,
    requestedAppKey: normalizedAppKey || null,
    resolvedAppId,
    isDevMain,
    bypassStandardChecks: isDevMain,
    hasAccess,
    permissions,
    roleKeys: roleKeysForContext,
    appKeys: appKeysForContext,
    appKeyTokens: appKeyTokensForContext,
    mappingCount: allMappingsRaw.length,
    activeMappingCount: allMappings.length,
    mappings: relevantMappings,
  };
}

export async function assertUserCanPerformAction(config = {}) {
  const {
    action,
    userId,
    appId,
    appKey,
    rolePermissionMap,
    defaultCrudForMappedRole,
    roleFieldCandidates,
    appFieldCandidates,
    supabaseClient = supabase,
    tableOverrides,
    columnOverrides,
  } = config;

  const normalizedAction = normalizeAction(action);

  if (!CRUD_ACTIONS.includes(normalizedAction)) {
    throw new Error(`Invalid action: ${String(action)}. Supported actions: ${CRUD_ACTIONS.join(", ")}`);
  }

  const result = await resolveUserRoleAccess({
    userId,
    appId,
    appKey,
    rolePermissionMap,
    defaultCrudForMappedRole,
    roleFieldCandidates,
    appFieldCandidates,
    supabaseClient,
    tableOverrides,
    columnOverrides,
  });

  if (!result.hasAccess) {
    throw new Error("Access denied: user has no role mapping for this application context");
  }

  if (!result.permissions[normalizedAction]) {
    throw new Error(`Access denied: ${normalizedAction.toUpperCase()} permission is not granted`);
  }

  return result;
}