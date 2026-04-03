import { NextResponse } from "next/server";
import { hasSupabaseAdminConfig, supabaseAdmin } from "@/lib/supabaseAdmin";

const USER_DETAILS_TABLE = "PSB_M_UserDetails";
const USER_MASTER_TABLE_CANDIDATES = [
  "PSB_S_Usermaster",
  "PSB_S_UserMaster",
  "psb_s_usermaster",
];
const USER_ACCESS_TABLE_CANDIDATES = [
  "PSB_M_UserAppRoleAccess",
  "PSB_M_Userapproleaccess",
  "psb_m_userapproleaccess",
];
const ROLE_TABLE = "PSB_S_Role";
const APP_TABLE = "PSB_S_Application";
const COMPANY_TABLE = "PSB_S_Company";
const AUTO_ASSIGN_APP_NAME = "PSBportal";
const AUTO_ASSIGN_ROLE_NAME = "psbUserMain";

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseOptionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text ? text : null;
}

function isActiveValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
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

async function resolveTableName(candidates, probeColumn) {
  for (const tableName of candidates) {
    const probe = await supabaseAdmin.from(tableName).select(probeColumn).limit(1);

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
    error: { message: `Unable to resolve table for probe column ${probeColumn}.` },
  };
}

async function resolveWorkingTables() {
  const [masterTable, accessTable] = await Promise.all([
    resolveTableName(USER_MASTER_TABLE_CANDIDATES, "user_id"),
    resolveTableName(USER_ACCESS_TABLE_CANDIDATES, "uar_id"),
  ]);

  if (masterTable.error || !masterTable.tableName) {
    return { masterTable: null, accessTable: null, error: masterTable.error };
  }

  if (accessTable.error || !accessTable.tableName) {
    return { masterTable: null, accessTable: null, error: accessTable.error };
  }

  return {
    masterTable: masterTable.tableName,
    accessTable: accessTable.tableName,
    error: null,
  };
}

async function resolveAutoAssignIds() {
  const [roleResponse, appResponse] = await Promise.all([
    supabaseAdmin.from(ROLE_TABLE).select("role_id,role_name,is_active").ilike("role_name", AUTO_ASSIGN_ROLE_NAME),
    supabaseAdmin.from(APP_TABLE).select("app_id,app_name,is_active").ilike("app_name", AUTO_ASSIGN_APP_NAME),
  ]);

  if (roleResponse.error || appResponse.error) {
    return {
      roleId: null,
      appId: null,
      error: roleResponse.error || appResponse.error,
    };
  }

  const roleRows = roleResponse.data ?? [];
  const appRows = appResponse.data ?? [];

  const chosenRole = roleRows.find((row) => isActiveValue(row.is_active)) ?? roleRows[0] ?? null;
  const chosenApp = appRows.find((row) => isActiveValue(row.is_active)) ?? appRows[0] ?? null;

  if (!chosenRole || !chosenApp) {
    return {
      roleId: null,
      appId: null,
      error: {
        message:
          "Unable to resolve default auto-assignment role/app. Ensure psbUserMain role and PSBportal app exist.",
      },
    };
  }

  return {
    roleId: Number(chosenRole.role_id),
    appId: Number(chosenApp.app_id),
    error: null,
  };
}

async function autoAssignDefaultAccessForNewDetails(userId, accessTableName) {
  const ids = await resolveAutoAssignIds();
  if (ids.error || !ids.roleId || !ids.appId) {
    return { ok: false, error: ids.error || { message: "Unable to resolve auto-assignment ids." } };
  }

  const existingResponse = await supabaseAdmin
    .from(accessTableName)
    .select("uar_id")
    .eq("user_id", userId)
    .eq("app_id", ids.appId)
    .limit(1)
    .maybeSingle();

  if (existingResponse.error && existingResponse.error.code !== "PGRST116") {
    return { ok: false, error: existingResponse.error };
  }

  const payload = {
    user_id: userId,
    role_id: ids.roleId,
    app_id: ids.appId,
    is_active: true,
  };

  if (existingResponse.data?.uar_id) {
    const updateResponse = await supabaseAdmin
      .from(accessTableName)
      .update(payload)
      .eq("uar_id", existingResponse.data.uar_id)
      .select("uar_id")
      .maybeSingle();

    if (updateResponse.error) {
      return { ok: false, error: updateResponse.error };
    }

    return { ok: true, error: null };
  }

  const insertResponse = await supabaseAdmin
    .from(accessTableName)
    .insert(payload)
    .select("uar_id")
    .maybeSingle();

  if (insertResponse.error) {
    return { ok: false, error: insertResponse.error };
  }

  return { ok: true, error: null };
}

function combineUsers(masterRows, detailsRows) {
  const detailsByUserId = new Map((detailsRows ?? []).map((row) => [row.user_id, row]));
  const combined = [];

  for (const master of masterRows ?? []) {
    const details = detailsByUserId.get(master.user_id) ?? null;

    combined.push({
      user_id: master.user_id,
      first_name: master.first_name,
      middle_name: master.middle_name,
      last_name: master.last_name,
      address: master.address,
      date_created: master.date_created,
      ud_id: details?.ud_id ?? null,
      username: details?.username ?? "",
      email: details?.email ?? "",
      is_active: details?.is_active ?? false,
      date_added: details?.date_added ?? null,
    });
  }

  for (const details of detailsRows ?? []) {
    const exists = combined.some((row) => row.user_id === details.user_id);
    if (exists) continue;

    combined.push({
      user_id: details.user_id,
      first_name: null,
      middle_name: null,
      last_name: null,
      address: null,
      date_created: null,
      ud_id: details.ud_id,
      username: details.username,
      email: details.email,
      is_active: details.is_active,
      date_added: details.date_added,
    });
  }

  return combined.sort((left, right) => Number(left.user_id) - Number(right.user_id));
}

async function getCombinedUserById(masterTable, userId) {
  const [masterResponse, detailsResponse] = await Promise.all([
    supabaseAdmin
      .from(masterTable)
      .select("user_id,first_name,middle_name,last_name,address,date_created")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from(USER_DETAILS_TABLE)
      .select("ud_id,user_id,username,email,is_active,date_added")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (masterResponse.error || detailsResponse.error) {
    return { user: null, error: masterResponse.error || detailsResponse.error };
  }

  const users = combineUsers(
    masterResponse.data ? [masterResponse.data] : [],
    detailsResponse.data ? [detailsResponse.data] : []
  );

  return { user: users[0] ?? null, error: null };
}

async function hasDevMainAccess(userId, accessTableName) {
  const roleResponse = await supabaseAdmin
    .from(ROLE_TABLE)
    .select("role_id,is_active")
    .ilike("role_name", "DEVMAIN");

  if (roleResponse.error) {
    return { ok: false, hasAccess: false, error: roleResponse.error };
  }

  const activeRoleIds = (roleResponse.data ?? [])
    .filter((role) => role.is_active !== false && role.is_active !== 0 && role.is_active !== "0")
    .map((role) => role.role_id);

  if (activeRoleIds.length === 0) {
    return { ok: true, hasAccess: false, error: null };
  }

  const accessResponse = await supabaseAdmin
    .from(accessTableName)
    .select("uar_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role_id", activeRoleIds)
    .limit(1)
    .maybeSingle();

  if (accessResponse.error && accessResponse.error.code !== "PGRST116") {
    return { ok: false, hasAccess: false, error: accessResponse.error };
  }

  return { ok: true, hasAccess: Boolean(accessResponse.data), error: null };
}

async function validateDevMainActor(actorUserId, accessTableName) {
  if (!hasSupabaseAdminConfig || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Admin API is not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  if (!actorUserId) {
    return NextResponse.json({ error: "Missing actor user id." }, { status: 401 });
  }

  const check = await hasDevMainAccess(actorUserId, accessTableName);
  if (!check.ok) {
    return NextResponse.json(
      { error: "Unable to validate access right now." },
      { status: 500 }
    );
  }

  if (!check.hasAccess) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  return null;
}

export async function GET(request) {
  const actorUserId = parseInteger(request.nextUrl.searchParams.get("actorUserId"));
  const tableResolution = await resolveWorkingTables();

  if (tableResolution.error || !tableResolution.masterTable || !tableResolution.accessTable) {
    return NextResponse.json(
      { error: "Unable to load settings data right now." },
      { status: 500 }
    );
  }

  const deniedResponse = await validateDevMainActor(actorUserId, tableResolution.accessTable);
  if (deniedResponse) return deniedResponse;

  const [mastersResponse, detailsResponse, accessResponse, rolesResponse, appsResponse, companyResponse] =
    await Promise.all([
      supabaseAdmin
        .from(tableResolution.masterTable)
        .select("user_id,first_name,middle_name,last_name,address,date_created")
        .order("user_id", { ascending: true }),
      supabaseAdmin
        .from(USER_DETAILS_TABLE)
        .select("ud_id,user_id,username,email,is_active,date_added")
        .order("user_id", { ascending: true }),
      supabaseAdmin
        .from(tableResolution.accessTable)
        .select("uar_id,user_id,role_id,app_id,is_active")
        .order("uar_id", { ascending: true }),
      supabaseAdmin
        .from(ROLE_TABLE)
        .select("role_id,role_name,role_desc,is_active")
        .order("role_id", { ascending: true }),
      supabaseAdmin
        .from(APP_TABLE)
        .select("app_id,app_name,app_desc,is_active")
        .order("app_id", { ascending: true }),
      supabaseAdmin
        .from(COMPANY_TABLE)
        .select("comp_id,comp_name,short_name,is_active,comp_email,comp_phone")
        .order("comp_id", { ascending: true }),
    ]);

  const isCompanyUnavailable =
    Boolean(companyResponse.error) && isMissingRelationError(companyResponse.error);

  if (
    mastersResponse.error ||
    detailsResponse.error ||
    accessResponse.error ||
    rolesResponse.error ||
    appsResponse.error ||
    (companyResponse.error && !isCompanyUnavailable)
  ) {
    return NextResponse.json(
      { error: "Unable to load settings data right now." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      users: combineUsers(mastersResponse.data ?? [], detailsResponse.data ?? []),
      accessRows: accessResponse.data ?? [],
      roles: rolesResponse.data ?? [],
      apps: appsResponse.data ?? [],
      companies: isCompanyUnavailable ? [] : companyResponse.data ?? [],
    },
    { status: 200 }
  );
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const tableResolution = await resolveWorkingTables();
  if (tableResolution.error || !tableResolution.masterTable || !tableResolution.accessTable) {
    return NextResponse.json(
      { error: "Unable to update settings data right now." },
      { status: 500 }
    );
  }

  const actorUserId = parseInteger(body?.actorUserId);
  const deniedResponse = await validateDevMainActor(actorUserId, tableResolution.accessTable);
  if (deniedResponse) return deniedResponse;

  const action = String(body?.action ?? "");

  if (action === "create-company-master") {
    const compName = normalizeText(body?.compName);
    const shortName = normalizeNullableText(body?.shortName);
    const compEmail = normalizeNullableText(body?.compEmail);
    const compPhone = normalizeNullableText(body?.compPhone);
    const isActive = parseOptionalBoolean(body?.isActive);

    if (!compName) {
      return NextResponse.json(
        { error: "Company name is required." },
        { status: 400 }
      );
    }

    const insertResponse = await supabaseAdmin
      .from(COMPANY_TABLE)
      .insert({
        comp_name: compName,
        short_name: shortName,
        comp_email: compEmail,
        comp_phone: compPhone,
        is_active: isActive === null ? true : isActive,
      })
      .select("comp_id,comp_name,short_name,is_active,comp_email,comp_phone")
      .maybeSingle();

    if (insertResponse.error) {
      return NextResponse.json(
        { error: "Unable to create company details right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ company: insertResponse.data }, { status: 200 });
  }

  if (action === "update-company-master") {
    const compId = parseInteger(body?.compId);
    if (!compId) {
      return NextResponse.json({ error: "compId is required." }, { status: 400 });
    }

    const payload = {};
    if (body?.compName !== undefined) {
      const compName = normalizeText(body?.compName);
      if (!compName) {
        return NextResponse.json(
          { error: "Company name is required." },
          { status: 400 }
        );
      }
      payload.comp_name = compName;
    }
    if (body?.shortName !== undefined) payload.short_name = normalizeNullableText(body?.shortName);
    if (body?.compEmail !== undefined) payload.comp_email = normalizeNullableText(body?.compEmail);
    if (body?.compPhone !== undefined) payload.comp_phone = normalizeNullableText(body?.compPhone);

    const isActive = parseOptionalBoolean(body?.isActive);
    if (isActive !== null) payload.is_active = isActive;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
    }

    const updateResponse = await supabaseAdmin
      .from(COMPANY_TABLE)
      .update(payload)
      .eq("comp_id", compId)
      .select("comp_id,comp_name,short_name,is_active,comp_email,comp_phone")
      .maybeSingle();

    if (updateResponse.error) {
      return NextResponse.json(
        { error: "Unable to update company details right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ company: updateResponse.data }, { status: 200 });
  }

  if (action === "delete-company-master") {
    const compId = parseInteger(body?.compId);
    if (!compId) {
      return NextResponse.json({ error: "compId is required." }, { status: 400 });
    }

    const deleteResponse = await supabaseAdmin
      .from(COMPANY_TABLE)
      .delete()
      .eq("comp_id", compId)
      .select("comp_id")
      .maybeSingle();

    if (deleteResponse.error) {
      return NextResponse.json(
        { error: "Unable to delete company details right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ deletedCompId: compId }, { status: 200 });
  }

  if (action === "create-user-master") {
    const firstName = normalizeText(body?.firstName);
    const middleName = normalizeNullableText(body?.middleName);
    const lastName = normalizeText(body?.lastName);
    const address = normalizeNullableText(body?.address);

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "firstName and lastName are required to create a user." },
        { status: 400 }
      );
    }

    const masterInsert = await supabaseAdmin
      .from(tableResolution.masterTable)
      .insert({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        address,
      })
      .select("user_id,first_name,middle_name,last_name,address,date_created")
      .maybeSingle();

    if (masterInsert.error || !masterInsert.data?.user_id) {
      return NextResponse.json(
        { error: "Unable to create user master row right now." },
        { status: 500 }
      );
    }

    const combined = combineUsers([masterInsert.data], []);
    return NextResponse.json({ user: combined[0] ?? null }, { status: 200 });
  }

  if (action === "create-user-master-detail") {
    const firstName = normalizeText(body?.firstName);
    const middleName = normalizeNullableText(body?.middleName);
    const lastName = normalizeText(body?.lastName);
    const address = normalizeNullableText(body?.address);
    const username = normalizeText(body?.username);
    const email = normalizeText(body?.email);
    const password = normalizeText(body?.password);
    const isActive = parseOptionalBoolean(body?.isActive);

    if (!firstName || !lastName || !username || !email || !password) {
      return NextResponse.json(
        {
          error:
            "firstName, lastName, username, email and password are required to create a user.",
        },
        { status: 400 }
      );
    }

    const masterPayload = {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      address,
    };

    const masterInsert = await supabaseAdmin
      .from(tableResolution.masterTable)
      .insert(masterPayload)
      .select("user_id,first_name,middle_name,last_name,address,date_created")
      .maybeSingle();

    if (masterInsert.error || !masterInsert.data?.user_id) {
      return NextResponse.json(
        { error: "Unable to create user master row right now." },
        { status: 500 }
      );
    }

    const userId = masterInsert.data.user_id;

    const detailsInsert = await supabaseAdmin
      .from(USER_DETAILS_TABLE)
      .insert({
        user_id: userId,
        username,
        email,
        password,
        is_active: isActive === null ? true : isActive,
      })
      .select("ud_id,user_id,username,email,is_active,date_added")
      .maybeSingle();

    if (detailsInsert.error) {
      await supabaseAdmin.from(tableResolution.masterTable).delete().eq("user_id", userId);
      return NextResponse.json(
        { error: "Unable to create user details row right now." },
        { status: 500 }
      );
    }

    const autoAssignResult = await autoAssignDefaultAccessForNewDetails(
      userId,
      tableResolution.accessTable
    );

    if (!autoAssignResult.ok) {
      await supabaseAdmin.from(USER_DETAILS_TABLE).delete().eq("user_id", userId);
      await supabaseAdmin.from(tableResolution.masterTable).delete().eq("user_id", userId);
      return NextResponse.json(
        { error: "Unable to auto-assign PSBportal/psbUserMain access right now." },
        { status: 500 }
      );
    }

    const combined = combineUsers([masterInsert.data], [detailsInsert.data]);
    return NextResponse.json({ user: combined[0] ?? null }, { status: 200 });
  }

  if (action === "update-user-master-detail" || action === "update-user") {
    const userId = parseInteger(body?.userId);
    if (!userId) {
      return NextResponse.json({ error: "userId is required for user update." }, { status: 400 });
    }

    const masterPayload = {};
    if (body?.firstName !== undefined) masterPayload.first_name = normalizeText(body.firstName);
    if (body?.middleName !== undefined) masterPayload.middle_name = normalizeNullableText(body.middleName);
    if (body?.lastName !== undefined) masterPayload.last_name = normalizeText(body.lastName);
    if (body?.address !== undefined) masterPayload.address = normalizeNullableText(body.address);

    const detailsPayload = {};
    if (body?.username !== undefined) detailsPayload.username = normalizeText(body.username);
    if (body?.email !== undefined) detailsPayload.email = normalizeText(body.email);
    if (body?.password !== undefined) {
      const password = normalizeText(body.password);
      if (password) detailsPayload.password = password;
    }

    const isActive = parseOptionalBoolean(body?.isActive);
    if (isActive !== null) {
      detailsPayload.is_active = isActive;
    }

    if (Object.keys(masterPayload).length === 0 && Object.keys(detailsPayload).length === 0) {
      return NextResponse.json(
        { error: "No changes supplied for user update." },
        { status: 400 }
      );
    }

    if (Object.keys(masterPayload).length > 0) {
      const masterUpdate = await supabaseAdmin
        .from(tableResolution.masterTable)
        .update(masterPayload)
        .eq("user_id", userId)
        .select("user_id")
        .maybeSingle();

      if (masterUpdate.error) {
        return NextResponse.json(
          { error: "Unable to update user master row right now." },
          { status: 500 }
        );
      }
    }

    if (Object.keys(detailsPayload).length > 0) {
      const existingDetails = await supabaseAdmin
        .from(USER_DETAILS_TABLE)
        .select("ud_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (existingDetails.error && existingDetails.error.code !== "PGRST116") {
        return NextResponse.json(
          { error: "Unable to check existing user details right now." },
          { status: 500 }
        );
      }

      if (existingDetails.data?.ud_id) {
        const detailsUpdate = await supabaseAdmin
          .from(USER_DETAILS_TABLE)
          .update(detailsPayload)
          .eq("user_id", userId)
          .select("ud_id")
          .maybeSingle();

        if (detailsUpdate.error) {
          return NextResponse.json(
            { error: "Unable to update user details right now." },
            { status: 500 }
          );
        }
      } else {
        const username = normalizeText(detailsPayload.username);
        const email = normalizeText(detailsPayload.email);
        const password = normalizeText(detailsPayload.password);
        const shouldCreateDetails = Boolean(username || email || password);

        if (shouldCreateDetails && (!username || !email)) {
          return NextResponse.json(
            {
              error:
                "Username and email are required when creating a user details row.",
            },
            { status: 400 }
          );
        }

        if (shouldCreateDetails) {
          const insertPayload = {
            user_id: userId,
            username,
            email,
            is_active: detailsPayload.is_active ?? true,
          };

          if (password) {
            insertPayload.password = password;
          }

          const detailsInsert = await supabaseAdmin
            .from(USER_DETAILS_TABLE)
            .insert(insertPayload)
            .select("ud_id")
            .maybeSingle();

          if (detailsInsert.error) {
            return NextResponse.json(
              { error: "Unable to create user details right now." },
              { status: 500 }
            );
          }

          const autoAssignResult = await autoAssignDefaultAccessForNewDetails(
            userId,
            tableResolution.accessTable
          );

          if (!autoAssignResult.ok) {
            await supabaseAdmin.from(USER_DETAILS_TABLE).delete().eq("user_id", userId);
            return NextResponse.json(
              { error: "Unable to auto-assign PSBportal/psbUserMain access right now." },
              { status: 500 }
            );
          }
        }
      }
    }

    const combinedUser = await getCombinedUserById(tableResolution.masterTable, userId);
    if (combinedUser.error) {
      return NextResponse.json(
        { error: "Unable to load updated user record right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: combinedUser.user }, { status: 200 });
  }

  if (action === "upsert-access") {
    const uarId = parseInteger(body?.uarId);
    const userId = parseInteger(body?.userId);
    const roleId = parseInteger(body?.roleId);
    const appId = parseInteger(body?.appId);
    const isActive = parseOptionalBoolean(body?.isActive);

    if (!userId || !roleId || !appId) {
      return NextResponse.json(
        { error: "userId, roleId and appId are required for access update." },
        { status: 400 }
      );
    }

    const payload = {
      user_id: userId,
      role_id: roleId,
      app_id: appId,
      is_active: isActive === null ? true : isActive,
    };

    let result;
    if (uarId) {
      const updateResponse = await supabaseAdmin
        .from(tableResolution.accessTable)
        .update(payload)
        .eq("uar_id", uarId)
        .select("uar_id,user_id,role_id,app_id,is_active")
        .maybeSingle();

      if (updateResponse.error) {
        return NextResponse.json(
          { error: "Unable to update user access right now." },
          { status: 500 }
        );
      }

      result = updateResponse.data;
    } else {
      const existingResponse = await supabaseAdmin
        .from(tableResolution.accessTable)
        .select("uar_id")
        .eq("user_id", userId)
        .eq("app_id", appId)
        .limit(1)
        .maybeSingle();

      if (existingResponse.error && existingResponse.error.code !== "PGRST116") {
        return NextResponse.json(
          { error: "Unable to check existing access rows." },
          { status: 500 }
        );
      }

      if (existingResponse.data?.uar_id) {
        const updateResponse = await supabaseAdmin
          .from(tableResolution.accessTable)
          .update(payload)
          .eq("uar_id", existingResponse.data.uar_id)
          .select("uar_id,user_id,role_id,app_id,is_active")
          .maybeSingle();

        if (updateResponse.error) {
          return NextResponse.json(
            { error: "Unable to update existing user access row." },
            { status: 500 }
          );
        }

        result = updateResponse.data;
      } else {
        const insertResponse = await supabaseAdmin
          .from(tableResolution.accessTable)
          .insert(payload)
          .select("uar_id,user_id,role_id,app_id,is_active")
          .maybeSingle();

        if (insertResponse.error) {
          return NextResponse.json(
            { error: "Unable to create user access row right now." },
            { status: 500 }
          );
        }

        result = insertResponse.data;
      }
    }

    return NextResponse.json({ accessRow: result }, { status: 200 });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
