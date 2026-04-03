import { NextResponse } from "next/server";
import { hasSupabaseAdminConfig, supabaseAdmin } from "@/lib/supabaseAdmin";

const USER_DETAILS_TABLE = "PSB_M_UserDetails";
const USER_ACCESS_TABLE_CANDIDATES = [
  "PSB_M_UserAppRoleAccess",
  "PSB_M_Userapproleaccess",
  "psb_m_userapproleaccess",
];
const ROLE_TABLE = "PSB_S_Role";

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

function isInactiveUser(userDetails) {
  const activeFlag = userDetails.is_active ?? userDetails.isactive;
  return activeFlag === false || activeFlag === 0 || activeFlag === "0";
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

async function hasDevMainAccess(userId, accessTableName) {
  const devRoleResponse = await supabaseAdmin
    .from(ROLE_TABLE)
    .select("role_id,is_active")
    .ilike("role_name", "DEVMAIN");

  if (devRoleResponse.error) {
    return { error: devRoleResponse.error, hasAccess: false };
  }

  const activeDevRoleIds = (devRoleResponse.data ?? [])
    .filter((role) => role.is_active !== false && role.is_active !== 0 && role.is_active !== "0")
    .map((role) => role.role_id);

  if (activeDevRoleIds.length === 0) {
    return { error: null, hasAccess: false };
  }

  const accessResponse = await supabaseAdmin
    .from(accessTableName)
    .select("uar_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role_id", activeDevRoleIds)
    .limit(1)
    .maybeSingle();

  if (accessResponse.error && accessResponse.error.code !== "PGRST116") {
    return { error: accessResponse.error, hasAccess: false };
  }

  return { error: null, hasAccess: Boolean(accessResponse.data) };
}

export async function POST(request) {
  if (!hasSupabaseAdminConfig || !supabaseAdmin) {
    return NextResponse.json(
      {
        error:
          "Server login is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required." },
      { status: 400 }
    );
  }

  const tableCandidates = [USER_DETAILS_TABLE, "PSB_M_Userdetails", "psb_m_userdetails"];

  let userDetails = null;
  let queryError = null;

  for (const tableName of tableCandidates) {
    const response = await supabaseAdmin
      .from(tableName)
      .select("*")
      .ilike("username", username)
      .limit(1)
      .maybeSingle();

    if (response.error) {
      if (isMissingRelationError(response.error)) {
        continue;
      }

      queryError = response.error;
      break;
    }

    if (response.data) {
      userDetails = response.data;
      break;
    }
  }

  if (queryError) {
    return NextResponse.json(
      { error: "Unable to login right now. Please try again." },
      { status: 500 }
    );
  }

  if (!userDetails) {
    return NextResponse.json({ error: "Username not found." }, { status: 401 });
  }

  if (isInactiveUser(userDetails)) {
    return NextResponse.json(
      { error: "This account is inactive. Please contact admin." },
      { status: 403 }
    );
  }

  if ((userDetails.password ?? "") !== password) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const accessTable = await resolveAccessTableName();
  if (accessTable.error || !accessTable.tableName) {
    return NextResponse.json(
      { error: "Unable to login right now. Please try again." },
      { status: 500 }
    );
  }

  const devMainAccess = await hasDevMainAccess(userDetails.user_id, accessTable.tableName);
  if (devMainAccess.error) {
    return NextResponse.json(
      { error: "Unable to login right now. Please try again." },
      { status: 500 }
    );
  }

  const isDevMain = devMainAccess.hasAccess;

  return NextResponse.json(
    {
      user: {
        udId: userDetails.ud_id,
        userId: userDetails.user_id,
        email: userDetails.email,
        username: userDetails.username,
        isDevMain,
        hasAllAppsAccess: isDevMain,
      },
    },
    { status: 200 }
  );
}
