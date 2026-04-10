import { NextResponse } from "next/server";
import {
  getAuthenticatedContext,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";
import { calculateQuote } from "@/modules/gutter/services/gutter.service";

const GUTTER_APP_KEY = "gutter-calculator";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function toIntOrNull(value) {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toNumOrNull(value) {
  if (!hasValue(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUserDisplayName(userRecord) {
  if (!userRecord || typeof userRecord !== "object") return "";

  const candidate = [
    userRecord.full_name,
    userRecord.display_name,
    userRecord.username,
    userRecord.user_name,
    userRecord.name,
    userRecord.email,
  ].find(hasValue);

  return hasValue(candidate) ? String(candidate).trim() : "";
}

function mapQuoteSections(sideRows) {
  return (Array.isArray(sideRows) ? sideRows : []).map((row) => ({
    sides: row?.segments,
    length: row?.length,
    height: row?.height,
    downspoutQty: row?.downspout_qty,
  }));
}

function mapQuoteExtras(extraRows) {
  return (Array.isArray(extraRows) ? extraRows : []).map((row) => ({
    description: row?.name || "",
    qty: row?.quantity,
    unitPrice: row?.unit_price,
  }));
}

async function fetchQuoteSetupByHeader(supabase, headerPayload) {
  const [manufacturerResult, tripRateResult, discountResult, leafGuardResult] = await Promise.all([
    hasValue(headerPayload?.manufacturer_id)
      ? supabase
          .from("core_s_manufacturers")
          .select("manufacturer_id, name, rate")
          .eq("manufacturer_id", headerPayload.manufacturer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(headerPayload?.trip_id)
      ? supabase
          .from("core_s_trip_rates")
          .select("trip_id, label, rate")
          .eq("trip_id", headerPayload.trip_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(headerPayload?.discount_id)
      ? supabase
          .from("core_s_discounts")
          .select("discount_id, percentage")
          .eq("discount_id", headerPayload.discount_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(headerPayload?.leaf_guard_id)
      ? supabase
          .from("core_s_leaf_guards")
          .select("leaf_guard_id, name, price")
          .eq("leaf_guard_id", headerPayload.leaf_guard_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (manufacturerResult.error) {
    throw new Error(manufacturerResult.error.message || "Unable to load manufacturer setup");
  }

  if (tripRateResult.error) {
    throw new Error(tripRateResult.error.message || "Unable to load trip setup");
  }

  if (discountResult.error) {
    throw new Error(discountResult.error.message || "Unable to load discount setup");
  }

  if (leafGuardResult.error) {
    throw new Error(leafGuardResult.error.message || "Unable to load leaf guard setup");
  }

  const manufacturer = manufacturerResult.data;
  const tripRate = tripRateResult.data;
  const discount = discountResult.data;
  const leafGuard = leafGuardResult.data;

  return {
    materialManufacturer: hasValue(headerPayload?.manufacturer_id)
      ? [
          {
            id: headerPayload.manufacturer_id,
            name: manufacturer?.name || "",
            rate: manufacturer?.rate ?? 0,
          },
        ]
      : [],
    leafGuard: hasValue(headerPayload?.leaf_guard_id)
      ? [
          {
            id: headerPayload.leaf_guard_id,
            name: leafGuard?.name || "",
            price: leafGuard?.price ?? 0,
          },
        ]
      : [],
    tripRates: hasValue(headerPayload?.trip_id)
      ? [
          {
            id: headerPayload.trip_id,
            label: tripRate?.label || "",
            rate: tripRate?.rate ?? 0,
          },
        ]
      : [],
    discounts: hasValue(headerPayload?.discount_id)
      ? [
          {
            id: headerPayload.discount_id,
            percent: discount?.percentage ?? 0,
          },
        ]
      : [],
  };
}

function computeProjectTotalPrice(headerPayload, sideRows, extraRows, quoteSetup) {
  try {
    const quoteInput = {
      manufacturerId: headerPayload?.manufacturer_id,
      tripId: headerPayload?.trip_id,
      discountId: headerPayload?.discount_id,
      leafGuardId: headerPayload?.leaf_guard_id,
      cstm_trip_rate: headerPayload?.cstm_trip_rate,
      cstm_manufacturer_rate: headerPayload?.cstm_manufacturer_rate,
      cstm_discount_percentage: headerPayload?.cstm_discount_percentage,
      cstm_leaf_guard_price: headerPayload?.cstm_leaf_guard_price,
      deposit_percent: headerPayload?.deposit_percent,
      discountIncluded: Boolean(headerPayload?.discount_id || hasValue(headerPayload?.cstm_discount_percentage)),
      leafGuardIncluded: Boolean(headerPayload?.leaf_guard_id || hasValue(headerPayload?.cstm_leaf_guard_price)),
      extrasIncluded: Array.isArray(extraRows) && extraRows.length > 0,
      depositIncluded: hasValue(headerPayload?.deposit_percent) && Number(headerPayload.deposit_percent) > 0,
      sections: mapQuoteSections(sideRows),
      extras: mapQuoteExtras(extraRows),
    };

    const quoteResult = calculateQuote(quoteInput, quoteSetup);
    const total = Number(quoteResult?.pricing?.projectTotal);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

async function readJsonBody(request) {
  return request.json().catch(() => null);
}

async function getGutterAuthorizedContext() {
  const auth = await getAuthenticatedContext({ appKey: GUTTER_APP_KEY });
  if (auth.error) return { error: auth.error };

  if (auth.accountInactive || auth.statusRestricted) {
    return { error: toErrorResponse("Account is inactive or restricted", 403) };
  }

  const hasGutterAccess = Boolean(
    auth.access?.isDevMain || auth.access?.hasAccess || auth.access?.hasAppAccess
  );

  if (!hasGutterAccess) {
    return { error: toErrorResponse("Access denied for Gutter Calculator", 403) };
  }

  return { auth };
}

function resolveActiveUserId(auth) {
  return toIntOrNull(auth?.userRecord?.user_id ?? auth?.session?.userId);
}

function normalizeHeaderPayload(header) {
  const source = header && typeof header === "object" ? header : {};

  return {
    project_name: hasValue(source.project_name) ? String(source.project_name).trim() : "",
    customer: hasValue(source.customer) ? String(source.customer).trim() : "",
    project_address: hasValue(source.project_address) ? String(source.project_address).trim() : "",
    status_id: toIntOrNull(source.status_id),
    date: hasValue(source.date) ? String(source.date) : null,
    trip_id: toIntOrNull(source.trip_id),
    manufacturer_id: toIntOrNull(source.manufacturer_id),
    discount_id: toIntOrNull(source.discount_id),
    request_link: hasValue(source.request_link) ? String(source.request_link).trim() : "",
    leaf_guard_id: toIntOrNull(source.leaf_guard_id),
    cstm_trip_rate: toNumOrNull(source.cstm_trip_rate),
    cstm_manufacturer_rate: toNumOrNull(source.cstm_manufacturer_rate),
    cstm_discount_percentage: toNumOrNull(source.cstm_discount_percentage),
    cstm_leaf_guard_price: toNumOrNull(source.cstm_leaf_guard_price),
    deposit_percent: toNumOrNull(source.deposit_percent),
  };
}

function normalizeSideRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const source = row && typeof row === "object" ? row : {};
      const sideIndex = toIntOrNull(source.side_index) ?? index + 1;
      const segments = toIntOrNull(source.segments);
      const length = toNumOrNull(source.length);
      const height = toNumOrNull(source.height);
      const downspoutQty = toIntOrNull(source.downspout_qty);
      const gutterColorId = toIntOrNull(source.gutter_color_id);
      const downspoutColorId = toIntOrNull(source.downspout_color_id);

      const hasAnyValue =
        segments !== null ||
        length !== null ||
        height !== null ||
        downspoutQty !== null ||
        gutterColorId !== null ||
        downspoutColorId !== null;

      if (!hasAnyValue) return null;

      return {
        side_index: sideIndex,
        segments,
        length,
        height,
        downspout_qty: downspoutQty,
        gutter_color_id: gutterColorId,
        downspout_color_id: downspoutColorId,
      };
    })
    .filter(Boolean);
}

function normalizeExtraRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const source = row && typeof row === "object" ? row : {};
      const name = hasValue(source.name) ? String(source.name).trim() : "";
      const quantity = toIntOrNull(source.quantity);
      const unitPrice = toNumOrNull(source.unit_price);

      const hasAnyValue = name !== "" || quantity !== null || unitPrice !== null;
      if (!hasAnyValue) return null;

      return {
        name,
        quantity,
        unit_price: unitPrice,
      };
    })
    .filter(Boolean);
}

export async function GET(request) {
  try {
    const access = await getGutterAuthorizedContext();
    if (access.error) return access.error;

    const { auth } = access;
    const supabase = auth.supabaseClient;

    const { searchParams } = new URL(request.url);
    const projId = toIntOrNull(searchParams.get("projId"));

    if (projId !== null) {
      const [projectHeaderResult, projectSidesResult, projectExtrasResult, colorsResult] =
        await Promise.all([
          supabase.from("gtr_t_projects").select("*").eq("proj_id", projId).maybeSingle(),
          supabase
            .from("gtr_m_project_sides")
            .select("*")
            .eq("proj_id", projId)
            .order("side_index", { ascending: true }),
          supabase
            .from("gtr_m_project_extras")
            .select("*")
            .eq("proj_id", projId)
            .order("extra_id", { ascending: true }),
          supabase.from("core_s_colors").select("color_id, name").order("color_id", { ascending: true }),
        ]);

      if (projectHeaderResult.error) {
        throw new Error(projectHeaderResult.error.message || "Unable to load project header");
      }

      if (projectSidesResult.error) {
        throw new Error(projectSidesResult.error.message || "Unable to load project sides");
      }

      if (projectExtrasResult.error) {
        throw new Error(projectExtrasResult.error.message || "Unable to load project extras");
      }

      if (colorsResult.error) {
        throw new Error(colorsResult.error.message || "Unable to load color references");
      }

      const response = NextResponse.json({
        success: true,
        projectHeader: projectHeaderResult.data || null,
        projectSides: projectSidesResult.data || [],
        projectExtras: projectExtrasResult.data || [],
        colors: colorsResult.data || [],
      });

      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return response;
    }

    const [projectsResult, statusesResult] = await Promise.all([
      supabase
        .from("gtr_t_projects")
        .select(
          "proj_id, project_name, customer, project_address, status_id, date, created_at, updated_at, manufacturer_id, trip_id, discount_id, leaf_guard_id, request_link, deposit_percent, total_project_price, created_by, updated_by, core_s_statuses(name), core_s_manufacturers(name,rate), core_s_trip_rates(label,rate), core_s_discounts(percentage,description), core_s_leaf_guards(name,price)"
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("core_s_statuses")
        .select("status_id, name")
        .order("status_id", { ascending: true }),
    ]);

    if (projectsResult.error) {
      throw new Error(projectsResult.error.message || "Unable to load projects");
    }

    if (statusesResult.error) {
      throw new Error(statusesResult.error.message || "Unable to load statuses");
    }

    const projects = Array.isArray(projectsResult.data) ? projectsResult.data : [];
    const userIdValues = Array.from(
      new Set(
        projects
          .flatMap((project) => [toIntOrNull(project?.created_by), toIntOrNull(project?.updated_by)])
          .filter((value) => value !== null)
      )
    );

    let userById = new Map();

    if (userIdValues.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .from("psb_s_user")
        .select("*")
        .in("user_id", userIdValues);

      if (userError) {
        console.error("Gutter audit user lookup failed", userError);
      } else {
        userById = (userRows || []).reduce((map, row) => {
          map.set(String(row.user_id), row);
          return map;
        }, new Map());
      }
    }

    const projectsWithAuditLabels = projects.map((project) => {
      const createdById = toIntOrNull(project?.created_by);
      const updatedById = toIntOrNull(project?.updated_by);
      const createdUser = createdById === null ? null : userById.get(String(createdById));
      const updatedUser = updatedById === null ? null : userById.get(String(updatedById));

      const createdByLabel =
        toUserDisplayName(createdUser) ||
        (createdById === null ? "--" : `User #${createdById}`);
      const updatedByLabel =
        toUserDisplayName(updatedUser) ||
        (updatedById === null ? "--" : `User #${updatedById}`);

      return {
        ...project,
        created_by_name: createdByLabel,
        updated_by_name: updatedByLabel,
      };
    });

    const response = NextResponse.json({
      success: true,
      projects: projectsWithAuditLabels,
      statuses: statusesResult.data || [],
    });

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load gutter projects", 500);
  }
}

export async function PATCH(request) {
  try {
    const access = await getGutterAuthorizedContext();
    if (access.error) return access.error;

    const { auth } = access;
    const userId = resolveActiveUserId(auth);
    if (userId === null) {
      return toErrorResponse("Unable to resolve active user id", 400);
    }

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object") {
      return toErrorResponse("Invalid status update payload", 400);
    }

    const projId = toIntOrNull(body.projId);
    const statusId = toIntOrNull(body.statusId ?? body.status_id);

    if (projId === null || statusId === null) {
      return toErrorResponse("projId and statusId are required", 400);
    }

    const { error } = await auth.supabaseClient
      .from("gtr_t_projects")
      .update({
        status_id: statusId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("proj_id", projId);

    if (error) {
      throw new Error(error.message || "Unable to update project status");
    }

    return NextResponse.json({ success: true, projId, statusId });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update project status", 500);
  }
}

export async function DELETE(request) {
  try {
    const access = await getGutterAuthorizedContext();
    if (access.error) return access.error;

    const { auth } = access;
    const { searchParams } = new URL(request.url);
    let projId = toIntOrNull(searchParams.get("projId"));

    if (projId === null) {
      const body = await readJsonBody(request);
      projId = toIntOrNull(body?.projId);
    }

    if (projId === null) {
      return toErrorResponse("projId is required", 400);
    }

    const supabase = auth.supabaseClient;

    const { error: clearSidesError } = await supabase
      .from("gtr_m_project_sides")
      .delete()
      .eq("proj_id", projId);

    if (clearSidesError) {
      throw new Error(clearSidesError.message || "Unable to clear project sides");
    }

    const { error: clearExtrasError } = await supabase
      .from("gtr_m_project_extras")
      .delete()
      .eq("proj_id", projId);

    if (clearExtrasError) {
      throw new Error(clearExtrasError.message || "Unable to clear project extras");
    }

    const { error: deleteHeaderError } = await supabase
      .from("gtr_t_projects")
      .delete()
      .eq("proj_id", projId);

    if (deleteHeaderError) {
      throw new Error(deleteHeaderError.message || "Unable to delete project");
    }

    return NextResponse.json({ success: true, projId });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to delete project", 500);
  }
}

export async function POST(request) {
  try {
    const access = await getGutterAuthorizedContext();
    if (access.error) return access.error;

    const { auth } = access;

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object") {
      return toErrorResponse("Invalid save payload", 400);
    }

    const isEdit = body.isEdit === true;
    const projectId = toIntOrNull(body.projectId);

    if (isEdit && projectId === null) {
      return toErrorResponse("A valid project id is required for edit saves", 400);
    }

    const headerPayload = normalizeHeaderPayload(body.header);
    if (!headerPayload.status_id || !headerPayload.manufacturer_id || !headerPayload.trip_id) {
      return toErrorResponse("Status, Manufacturer, and Trip Rate are required", 400);
    }

    const sideRows = normalizeSideRows(body.sides);
    const extraRows = normalizeExtraRows(body.extras);

    const userId = resolveActiveUserId(auth);
    if (userId === null) {
      return toErrorResponse("Unable to resolve active user id", 400);
    }

    const supabase = auth.supabaseClient;
    const now = new Date().toISOString();
    const quoteSetup = await fetchQuoteSetupByHeader(supabase, headerPayload);
    const projectTotalPrice = computeProjectTotalPrice(headerPayload, sideRows, extraRows, quoteSetup);

    let currentProjId = projectId;

    if (isEdit) {
      const { error: headerError } = await supabase
        .from("gtr_t_projects")
        .update({
          ...headerPayload,
          total_project_price: projectTotalPrice,
          updated_at: now,
          updated_by: userId,
        })
        .eq("proj_id", currentProjId);

      if (headerError) {
        throw new Error("Error saving project: " + headerError.message);
      }

      const { error: clearSidesError } = await supabase
        .from("gtr_m_project_sides")
        .delete()
        .eq("proj_id", currentProjId);

      if (clearSidesError) {
        throw new Error("Error clearing existing sides: " + clearSidesError.message);
      }

      const { error: clearExtrasError } = await supabase
        .from("gtr_m_project_extras")
        .delete()
        .eq("proj_id", currentProjId);

      if (clearExtrasError) {
        throw new Error("Error clearing existing extras: " + clearExtrasError.message);
      }
    } else {
      const { data: insertedProject, error: headerError } = await supabase
        .from("gtr_t_projects")
        .insert({
          ...headerPayload,
          total_project_price: projectTotalPrice,
          created_at: now,
          updated_at: now,
          created_by: userId,
          updated_by: userId,
        })
        .select("proj_id")
        .single();

      if (headerError || !insertedProject?.proj_id) {
        throw new Error("Error saving project header: " + (headerError?.message || "Unknown error"));
      }

      currentProjId = insertedProject.proj_id;
    }

    const sidePayload = sideRows.map((row) => ({
      proj_id: currentProjId,
      ...row,
    }));

    if (sidePayload.length > 0) {
      const { error: sidesError } = await supabase.from("gtr_m_project_sides").insert(sidePayload);

      if (sidesError) {
        if (!isEdit) {
          await supabase.from("gtr_t_projects").delete().eq("proj_id", currentProjId);
        }
        throw new Error("Error saving sides: " + sidesError.message);
      }
    }

    const extraPayload = extraRows.map((row) => ({
      proj_id: currentProjId,
      ...row,
    }));

    if (extraPayload.length > 0) {
      const { error: extrasError } = await supabase.from("gtr_m_project_extras").insert(extraPayload);

      if (extrasError) {
        if (!isEdit) {
          await supabase.from("gtr_m_project_sides").delete().eq("proj_id", currentProjId);
          await supabase.from("gtr_t_projects").delete().eq("proj_id", currentProjId);
        }
        throw new Error("Error saving extras: " + extrasError.message);
      }
    }

    return NextResponse.json({
      success: true,
      projId: currentProjId,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to save gutter project", 500);
  }
}

