import { NextResponse } from "next/server";
import { hasSupabaseAdminConfig, supabaseAdmin } from "@/lib/supabaseAdmin";

const USER_DETAILS_TABLE = "PSB_M_UserDetails";
const USER_ACCESS_TABLE_CANDIDATES = [
  "PSB_M_UserAppRoleAccess",
  "PSB_M_Userapproleaccess",
  "psb_m_userapproleaccess",
];
const ROLE_TABLE = "PSB_S_Role";
const APP_TABLE = "PSB_S_Application";

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function isMissingRelationError(error) {
  if (!error) return false;

  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function isInactiveFlag(value) {
  return value === false || value === 0 || value === "0";
}

function isActiveFlag(value) {
  return !isInactiveFlag(value);
}

async function resolveAccessTableName() {
  for (const tableName of USER_ACCESS_TABLE_CANDIDATES) {
    const probe = await supabaseAdmin.from(tableName).select("uar_id").limit(1);

    if (probe.error) {
      if (isMissingRelationError(probe.error)) {
        continue;
      }

      return { tableName: null, error: probe.error };
    }

    return { tableName, error: null };
  }

  return {
    tableName: null,
    error: { message: "Unable to resolve user access table." },
  };
}

export async function GET(request) {
  if (!hasSupabaseAdminConfig || !supabaseAdmin) {
    return NextResponse.json(
      { error: "My Apps API is not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  const userId = parseInteger(request.nextUrl.searchParams.get("actorUserId"));
  if (!userId) {
    return NextResponse.json({ error: "Missing actor user id." }, { status: 400 });
  }

  const accessTable = await resolveAccessTableName();
  if (accessTable.error || !accessTable.tableName) {
    return NextResponse.json(
      { error: "Unable to load app access right now." },
      { status: 500 }
    );
  }

  const [userResponse, rolesResponse, appsResponse, accessResponse] = await Promise.all([
    supabaseAdmin
      .from(USER_DETAILS_TABLE)
      .select("ud_id,user_id,is_active")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from(ROLE_TABLE)
      .select("role_id,role_name,is_active"),
    supabaseAdmin
      .from(APP_TABLE)
      .select("app_id,app_name,app_desc,is_active"),
    supabaseAdmin
      .from(accessTable.tableName)
      .select("uar_id,user_id,role_id,app_id,is_active")
      .eq("user_id", userId),
  ]);

  if (userResponse.error || rolesResponse.error || appsResponse.error || accessResponse.error) {
    return NextResponse.json(
      { error: "Unable to load app access right now." },
      { status: 500 }
    );
  }

  if (!userResponse.data) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (isInactiveFlag(userResponse.data.is_active)) {
    return NextResponse.json(
      { error: "This account is inactive. Please contact admin." },
      { status: 403 }
    );
  }

  const roles = rolesResponse.data ?? [];
  const apps = (appsResponse.data ?? []).filter((app) => isActiveFlag(app.is_active));
  const accessRows = (accessResponse.data ?? []).filter((row) => isActiveFlag(row.is_active));

  const roleById = new Map(roles.map((role) => [role.role_id, role]));
  const activeDevRoleIds = roles
    .filter((role) => role.role_name?.toUpperCase() === "DEVMAIN" && isActiveFlag(role.is_active))
    .map((role) => role.role_id);

  const isDevMain = accessRows.some((row) => activeDevRoleIds.includes(row.role_id));

  const appRoleNames = new Map();
  for (const row of accessRows) {
    const current = appRoleNames.get(row.app_id) ?? new Set();
    const roleName = roleById.get(row.role_id)?.role_name || "USER";
    current.add(roleName);
    appRoleNames.set(row.app_id, current);
  }

  const visibleApps = isDevMain
    ? apps.map((app) => ({
        ...app,
        roleNames: ["DEVMAIN"],
      }))
    : apps
        .filter((app) => appRoleNames.has(app.app_id))
        .map((app) => ({
          ...app,
          roleNames: Array.from(appRoleNames.get(app.app_id) ?? []),
        }));

  return NextResponse.json(
    {
      isDevMain,
      apps: visibleApps,
      accessRows,
      accessTable: accessTable.tableName,
    },
    { status: 200 }
  );
}
