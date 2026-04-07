import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/infrastructure/supabase/server";

const SETUP_QUERIES = {
  statuses: {
    table: "gtr_s_statuses",
    select: "*",
    orderBy: "status_id",
  },
  colors: {
    table: "gtr_s_colors",
    select: "*",
    orderBy: "color_id",
  },
  manufacturers: {
    table: "gtr_s_manufacturers",
    select: "*",
    orderBy: "manufacturer_id",
  },
  leafGuards: {
    table: "gtr_s_leaf_guards",
    select: "*",
    orderBy: "leaf_guard_id",
  },
  tripRates: {
    table: "gtr_s_trip_rates",
    select: "*",
    orderBy: "trip_id",
  },
  discounts: {
    table: "gtr_s_discounts",
    select: "*",
    orderBy: "discount_id",
  },
  company: {
    table: "psb_s_company",
    select: "comp_id,comp_name,short_name,comp_email,comp_phone",
    orderBy: "comp_id",
    ascending: true,
    limit: 1,
  },
};

async function selectRows(supabaseClient, queryConfig) {
  let query = supabaseClient.from(queryConfig.table).select(queryConfig.select || "*");

  if (queryConfig.orderBy) {
    query = query.order(queryConfig.orderBy, { ascending: queryConfig.ascending !== false });
  }

  if (Number.isFinite(queryConfig.limit) && queryConfig.limit > 0) {
    query = query.limit(queryConfig.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function GET() {
  try {
    const supabaseClient = getServerSupabaseClient();
    const entries = Object.entries(SETUP_QUERIES);

    const settled = await Promise.allSettled(
      entries.map(([, config]) => selectRows(supabaseClient, config))
    );

    const payload = {};
    const sourceErrors = [];

    settled.forEach((result, index) => {
      const key = entries[index][0];

      if (result.status === "fulfilled") {
        payload[key] = result.value;
        return;
      }

      payload[key] = [];
      sourceErrors.push(key);
      console.error(`Gutter setup source failed: ${key}`, result.reason);
    });

    return NextResponse.json({
      ...payload,
      sourceErrors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "Unable to load gutter setup data",
      },
      { status: 500 }
    );
  }
}
