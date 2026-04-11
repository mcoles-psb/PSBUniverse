"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
} from "react-bootstrap";
import { supabase } from "@/infrastructure/supabase/client";
import { calculateQuote } from "@/modules/gutter/services/gutter.service";
import { createCacheKey, getOrFetchCached, invalidateCacheKeys } from "@/core/cache";
import { getSupabaseSelectWithCache } from "@/core/cache";
import { toastError, toastSuccess, toastWarning } from "@/shared/utils/toast";
import { startNavbarLoader } from "@/shared/utils/navbar-loader";

const emptySection = () => ({
  colorId: "",
  downspoutColorId: "",
  sides: "",
  length: "",
  height: "",
  downspoutQty: "",
});

const emptyExtra = () => ({ description: "", qty: "", unitPrice: "" });

const createInitialProject = () => ({
  projId: null,
  statusId: "",
  requestLink: "",
  customer: "",
  date: "",
  projectName: "",
  projectAddress: "",
  manufacturerId: "",
  manualManufacturerRateEnabled: false,
  manualManufacturerRate: "",
  tripId: "",
  manualTripRateEnabled: false,
  manualTripRate: "",
  sections: [emptySection()],
  leafGuardIncluded: false,
  leafGuardId: "",
  manualLeafGuardRateEnabled: false,
  manualLeafGuardRate: "",
  extrasIncluded: false,
  extras: [emptyExtra()],
  discountIncluded: false,
  discountId: "",
  manualDiscountRateEnabled: false,
  manualDiscountPercent: "",
  discountPercent: "",
  depositIncluded: false,
  depositPercent: "",
});

const MIN_DYNAMIC_SIDE_ROWS = 1;
const MAX_DYNAMIC_SIDE_ROWS = 10;
const MIN_SIDE_OR_DS_QTY = 1;
const MAX_SIDE_OR_DS_QTY = 10;
const CACHE_NAMESPACE = "psb-universe";
const SETUP_CACHE_TTL_MS = 8 * 60 * 60 * 1000;

const CACHE_KEYS = {
  setupBundle: createCacheKey("setup", "bundle"),
  statuses: createCacheKey("setup", "statuses"),
  colors: createCacheKey("setup", "colors"),
  manufacturers: createCacheKey("setup", "manufacturers"),
  leafGuards: createCacheKey("setup", "leafGuards"),
  tripRates: createCacheKey("setup", "tripRates"),
  discounts: createCacheKey("setup", "discounts"),
  companyProfile: createCacheKey("company", "profile"),
  projectList: createCacheKey("projects", "list"),
  projectDetail: (projId) => createCacheKey("projects", "detail", projId),
  projectSides: (projId) => createCacheKey("projects", "sides", projId),
  projectExtras: (projId) => createCacheKey("projects", "extras", projId),
};

const hasValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const pickFirst = (row, keys, fallback = "") => {
  for (const key of keys) {
    const value = row?.[key];
    if (hasValue(value)) return value;
  }
  return fallback;
};

const toNumberOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePercentRateValue = (value) => {
  if (!hasValue(value)) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const normalized = numeric > 1 ? numeric / 100 : numeric;
  return Math.min(1, Math.max(0, normalized));
};

const toDisplayPercentValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1 ? numeric : numeric * 100;
};

const formatPercentLabel = (value) => {
  const percent = toDisplayPercentValue(value);
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, "");
};

const normalizeStatuses = (rows) =>
  (rows || [])
    .map((row, index) => {
      const statusId = pickFirst(row, ["status_id", "id"], null);
      if (!hasValue(statusId)) return null;
      return {
        ...row,
        status_id: statusId,
        name: String(
          pickFirst(row, ["name", "status_name", "status", "label"], `Status ${index + 1}`)
        ),
      };
    })
    .filter(Boolean);

const normalizeColors = (rows) =>
  (rows || [])
    .map((row, index) => {
      const colorId = pickFirst(row, ["color_id", "id"], null);
      if (!hasValue(colorId)) return null;
      return {
        ...row,
        color_id: colorId,
        name: String(pickFirst(row, ["name", "color_name", "color", "label"], `Color ${index + 1}`)),
      };
    })
    .filter(Boolean);

const normalizeManufacturers = (rows) =>
  (rows || [])
    .map((row, index) => {
      const manufacturerId = pickFirst(row, ["manufacturer_id", "id"], null);
      if (!hasValue(manufacturerId)) return null;
      return {
        ...row,
        manufacturer_id: manufacturerId,
        name: String(
          pickFirst(
            row,
            ["name", "manufacturer_name", "manufacturer", "label"],
            `Manufacturer ${index + 1}`
          )
        ),
        rate: toNumberOrZero(pickFirst(row, ["rate", "unit_rate", "price"], 0)),
      };
    })
    .filter(Boolean);

const normalizeLeafGuards = (rows) =>
  (rows || [])
    .map((row, index) => {
      const leafGuardId = pickFirst(row, ["leaf_guard_id", "id"], null);
      if (!hasValue(leafGuardId)) return null;
      return {
        ...row,
        leaf_guard_id: leafGuardId,
        name: String(
          pickFirst(row, ["name", "leaf_guard_name", "leaf_guard", "label"], `Leaf Guard ${index + 1}`)
        ),
        price: toNumberOrZero(pickFirst(row, ["price", "rate", "unit_price"], 0)),
      };
    })
    .filter(Boolean);

const normalizeTripRates = (rows) =>
  (rows || [])
    .map((row, index) => {
      const tripId = pickFirst(row, ["trip_id", "id"], null);
      if (!hasValue(tripId)) return null;
      return {
        ...row,
        trip_id: tripId,
        label: String(pickFirst(row, ["label", "trip", "name"], `Trip ${index + 1}`)),
        rate: toNumberOrZero(pickFirst(row, ["rate", "price", "amount"], 0)),
      };
    })
    .filter(Boolean);

const normalizeDiscounts = (rows) =>
  (rows || [])
    .map((row, index) => {
      const discountId = pickFirst(row, ["discount_id", "id"], null);
      if (!hasValue(discountId)) return null;
      return {
        ...row,
        discount_id: discountId,
        percentage: toNumberOrZero(pickFirst(row, ["percentage", "percent", "rate"], 0)),
        description: String(pickFirst(row, ["description", "name", "label"], `Discount ${index + 1}`)),
      };
    })
    .filter(Boolean);

function mapHeaderToProject(header, sides, extras) {
  const mappedSections = (sides || []).map((side) => ({
    colorId: side.gutter_color_id ? String(side.gutter_color_id) : "",
    downspoutColorId: side.downspout_color_id
      ? String(side.downspout_color_id)
      : side.gutter_color_id
        ? String(side.gutter_color_id)
        : "",
    sides: side.segments !== null && side.segments !== undefined ? String(side.segments) : "",
    length: side.length !== null && side.length !== undefined ? String(side.length) : "",
    height: side.height !== null && side.height !== undefined ? String(side.height) : "",
    downspoutQty:
      side.downspout_qty !== null && side.downspout_qty !== undefined
        ? String(side.downspout_qty)
        : "",
  }));

  const mappedExtras = (extras || []).map((extra) => ({
    description: extra.name || "",
    qty: extra.quantity !== null && extra.quantity !== undefined ? String(extra.quantity) : "",
    unitPrice: extra.unit_price !== null && extra.unit_price !== undefined ? String(extra.unit_price) : "",
  }));

  const hasCustomManufacturerRate =
    header.cstm_manufacturer_rate !== null && header.cstm_manufacturer_rate !== undefined;
  const hasCustomTripRate = header.cstm_trip_rate !== null && header.cstm_trip_rate !== undefined;
  const hasCustomLeafGuardRate =
    header.cstm_leaf_guard_price !== null && header.cstm_leaf_guard_price !== undefined;
  const hasCustomDiscountPercent =
    header.cstm_discount_percentage !== null && header.cstm_discount_percentage !== undefined;

  const rawDepositPercent =
    header.deposit_percent !== null && header.deposit_percent !== undefined
      ? Number(header.deposit_percent)
      : null;
  const depositPercentDisplay =
    rawDepositPercent !== null && Number.isFinite(rawDepositPercent)
      ? rawDepositPercent > 1
        ? rawDepositPercent
        : rawDepositPercent * 100
      : "";
  const hasDepositPercent =
    rawDepositPercent !== null && Number.isFinite(rawDepositPercent) && rawDepositPercent > 0;

  return {
    projId: header.proj_id,
    statusId: header.status_id ? String(header.status_id) : "",
    requestLink: header.request_link || "",
    customer: header.customer || "",
    date: header.date || "",
    projectName: header.project_name || "",
    projectAddress: header.project_address || "",
    manufacturerId: header.manufacturer_id ? String(header.manufacturer_id) : "",
    manualManufacturerRateEnabled: hasCustomManufacturerRate,
    manualManufacturerRate: hasCustomManufacturerRate ? String(header.cstm_manufacturer_rate) : "",
    tripId: header.trip_id ? String(header.trip_id) : "",
    manualTripRateEnabled: hasCustomTripRate,
    manualTripRate: hasCustomTripRate ? String(header.cstm_trip_rate) : "",
    sections: mappedSections.length > 0 ? mappedSections : [emptySection()],
    leafGuardIncluded: Boolean(header.leaf_guard_id || hasCustomLeafGuardRate),
    leafGuardId: header.leaf_guard_id ? String(header.leaf_guard_id) : "",
    manualLeafGuardRateEnabled: hasCustomLeafGuardRate,
    manualLeafGuardRate: hasCustomLeafGuardRate ? String(header.cstm_leaf_guard_price) : "",
    extrasIncluded: mappedExtras.length > 0,
    extras: mappedExtras.length > 0 ? mappedExtras : [emptyExtra()],
    discountIncluded: Boolean(header.discount_id || hasCustomDiscountPercent),
    discountId: header.discount_id ? String(header.discount_id) : "",
    manualDiscountRateEnabled: hasCustomDiscountPercent,
    manualDiscountPercent: hasCustomDiscountPercent
      ? String(toDisplayPercentValue(header.cstm_discount_percentage))
      : "",
    discountPercent: "",
    depositIncluded: hasDepositPercent,
    depositPercent: depositPercentDisplay === "" ? "" : String(depositPercentDisplay),
  };
}

export default function GutterProjectForm({ mode = "create", projectId = null }) {
  const router = useRouter();
  const isEdit = mode === "edit" && hasValue(projectId);

  const [setup, setSetup] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [colors, setColors] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [leafGuards, setLeafGuards] = useState([]);
  const [tripFeeRates, setTripFeeRates] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [companyProfile, setCompanyProfile] = useState({
    name: "—",
    email: "—",
    phone: "—",
  });

  const [project, setProject] = useState(() => (isEdit ? null : createInitialProject()));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [refreshingSetup, setRefreshingSetup] = useState(false);

  const fetchSetupPayload = useCallback(async (forceFresh) => {
    const sourceErrors = [];

    let setupData = {};
    try {
      const response = await getOrFetchCached({
        key: CACHE_KEYS.setupBundle,
        namespace: CACHE_NAMESPACE,
        ttlMs: SETUP_CACHE_TTL_MS,
        forceFresh,
        allowStaleOnError: true,
        fetcher: async () => {
          const apiResponse = await fetch("/api/gutter/setup", {
            method: "GET",
            cache: "no-store",
          });

          const payload = await apiResponse.json().catch(() => ({}));
          if (!apiResponse.ok) {
            throw new Error(payload?.error || `Unable to load setup data (${apiResponse.status})`);
          }

          return payload;
        },
      });

      setupData = response?.data || {};
    } catch (error) {
      console.error("Failed loading gutter setup bundle", error);
      sourceErrors.push("setup bundle");
    }

    const normalizeSourceLabel = (label) =>
      String(label || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase();

    (Array.isArray(setupData?.sourceErrors) ? setupData.sourceErrors : []).forEach((label) => {
      sourceErrors.push(normalizeSourceLabel(label));
    });

    const getRows = (fieldName, fallbackLabel) => {
      const value = setupData?.[fieldName];
      if (Array.isArray(value)) {
        return value;
      }

      sourceErrors.push(fallbackLabel);
      return [];
    };

    const statusRows = getRows("statuses", "statuses");
    const colorRows = getRows("colors", "colors");
    const manufacturerRows = getRows("manufacturers", "manufacturers");
    const leafGuardRows = getRows("leafGuards", "leaf guards");
    const tripRows = getRows("tripRates", "trip rates");
    const discountRows = getRows("discounts", "discounts");
    const companyRows = Array.isArray(setupData?.company) ? setupData.company : [];

    const dedupedSourceErrors = Array.from(new Set(sourceErrors.filter(Boolean)));

    const s = normalizeStatuses(statusRows);
    const c = normalizeColors(colorRows);
    const m = normalizeManufacturers(manufacturerRows);
    const lg = normalizeLeafGuards(leafGuardRows);
    const tf = normalizeTripRates(tripRows);
    const d = normalizeDiscounts(discountRows);
    const hasCriticalOptions = s.length > 0 && c.length > 0 && m.length > 0 && tf.length > 0;

    const companyRow = Array.isArray(companyRows) ? companyRows[0] : companyRows || null;

    return {
      statuses: s,
      colors: c,
      manufacturers: m,
      leafGuards: lg,
      tripRates: tf,
      discounts: d,
      hasCriticalOptions,
      sourceErrors: dedupedSourceErrors,
      company: companyRow
        ? {
            name: String(companyRow.comp_name || companyRow.short_name || "—"),
            email: String(companyRow.comp_email || "—"),
            phone: String(companyRow.comp_phone || "—"),
          }
        : null,
    };
  }, []);

  const fetchProjectPayload = useCallback(async () => {
    const response = await fetch(`/api/gutter/projects?projId=${encodeURIComponent(projectId)}`, {
      method: "GET",
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || "Unable to load project data");
    }

    return {
      projectHeader: payload?.projectHeader || null,
      projectSides: Array.isArray(payload?.projectSides) ? payload.projectSides : [],
      projectExtras: Array.isArray(payload?.projectExtras) ? payload.projectExtras : [],
    };
  }, [projectId]);

  const loadData = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    if (isEdit || forceFresh) {
      setLoading(true);
    }

    try {
      let payload = await fetchSetupPayload(forceFresh);
      if (!forceFresh && !payload.hasCriticalOptions) {
        payload = await fetchSetupPayload(true);
      }

      setStatuses(payload.statuses);
      setColors(payload.colors);
      setManufacturers(payload.manufacturers);
      setLeafGuards(payload.leafGuards);
      setTripFeeRates(payload.tripRates);
      setDiscounts(payload.discounts);
      if (payload.company) {
        setCompanyProfile(payload.company);
      }

      if (payload.sourceErrors?.length > 0) {
        toastWarning(
          `Some setup sources failed to load: ${payload.sourceErrors.join(", ")}.`,
          "Gutter Setup"
        );
      }

      setSetup({
        materialManufacturer: payload.manufacturers.map((r) => ({
          id: r.manufacturer_id,
          name: r.name,
          rate: r.rate,
        })),
        leafGuard: payload.leafGuards.map((r) => ({
          id: r.leaf_guard_id,
          name: r.name,
          price: r.price,
        })),
        tripRates: payload.tripRates.map((r) => ({
          id: r.trip_id,
          label: r.label,
          rate: r.rate,
        })),
        discounts: payload.discounts.map((r) => ({
          id: r.discount_id,
          percent: r.percentage,
        })),
      });

      if (isEdit) {
        const projectPayload = await fetchProjectPayload(forceFresh);
        const header = projectPayload.projectHeader;
        if (!header) {
          setProject(null);
        } else {
          setProject(
            mapHeaderToProject(
              header,
              projectPayload.projectSides || [],
              projectPayload.projectExtras || []
            )
          );
        }
      } else {
        setProject((prev) => {
          const base = prev || createInitialProject();
          return {
            ...base,
            statusId: base.statusId || String(payload.statuses[0]?.status_id || ""),
            manufacturerId:
              base.manufacturerId || String(payload.manufacturers[0]?.manufacturer_id || ""),
            tripId: base.tripId || String(payload.tripRates[0]?.trip_id || ""),
          };
        });
      }
    } catch (error) {
      console.error("Failed to load gutter form data", error);
      toastError("Error loading form data.", "Gutter Project");
    }

    setLoading(false);
  }, [fetchProjectPayload, fetchSetupPayload, isEdit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    document.body.classList.add("gutter-quote-print-mode");

    return () => {
      document.body.classList.remove("gutter-quote-print-mode");
    };
  }, []);

  const refreshSetupOptions = useCallback(async () => {
    setRefreshingSetup(true);
    try {
      await loadData({ forceFresh: true });
    } finally {
      setRefreshingSetup(false);
    }
  }, [loadData]);

  const updateField = (field, value) => {
    setProject((prev) => ({ ...prev, [field]: value }));
  };

  const normalizeBoundedInt = (value, min, max) => {
    if (value === "") return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "";
    const normalized = Math.trunc(parsed);
    return String(Math.min(max, Math.max(min, normalized)));
  };

  const normalizeBoundedPercent = (value, min = 0, max = 100) => {
    if (value === "") return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "";
    return String(Math.min(max, Math.max(min, parsed)));
  };

  const updateSection = (index, field, value) => {
    setProject((prev) => {
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [field]: value };
      return { ...prev, sections };
    });
  };

  const addSection = () => {
    if ((project?.sections || []).length >= MAX_DYNAMIC_SIDE_ROWS) return;
    setProject((prev) => ({
      ...prev,
      sections: [...(prev.sections || []), emptySection()],
    }));
  };

  const removeSection = (index) => {
    setProject((prev) => ({
      ...prev,
      sections:
        (prev.sections || []).length <= MIN_DYNAMIC_SIDE_ROWS
          ? prev.sections || []
          : (prev.sections || []).filter((_, i) => i !== index),
    }));
  };

  const updateExtra = (index, field, value) => {
    setProject((prev) => {
      const extras = [...(prev.extras || [])];
      extras[index] = { ...extras[index], [field]: value };
      return { ...prev, extras };
    });
  };

  const addExtra = () => {
    if ((project?.extras || []).length >= 4) return;
    setProject((prev) => ({
      ...prev,
      extras: [...(prev.extras || []), emptyExtra()],
    }));
  };

  const removeExtra = (index) => {
    setProject((prev) => ({
      ...prev,
      extras: (prev.extras || []).filter((_, i) => i !== index),
    }));
  };

  const quoteResult = useMemo(() => {
    if (!setup || !project) {
      return null;
    }
    return calculateQuote(project, setup);
  }, [project, setup]);

  const selectedManufacturerName = useMemo(() => {
    const selected = manufacturers.find(
      (m) => String(m.manufacturer_id) === String(project?.manufacturerId || "")
    );
    return selected?.name || "—";
  }, [manufacturers, project?.manufacturerId]);

  const selectedLeafGuardName = useMemo(() => {
    if (!project?.leafGuardIncluded) return "";
    const selected = leafGuards.find(
      (item) => String(item.leaf_guard_id) === String(project?.leafGuardId || "")
    );
    return String(selected?.name || "").trim();
  }, [leafGuards, project?.leafGuardId, project?.leafGuardIncluded]);

  const colorNameById = useMemo(() => {
    const map = {};
    (colors || []).forEach((color) => {
      map[String(color.color_id)] = color.name || "";
    });
    return map;
  }, [colors]);

  const sectionBreakdownRows = useMemo(() => {
    if (!project) return [];

    const toIntegerOrNull = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };

    const gutterFootages = Array.isArray(quoteResult?.pricing?.gutterQuantities)
      ? quoteResult.pricing.gutterQuantities
      : [];
    const downspoutFootages = Array.isArray(quoteResult?.pricing?.downspoutFootages)
      ? quoteResult.pricing.downspoutFootages
      : [];

    return (project.sections || [])
      .map((section, index) => {
        const sides = toIntegerOrNull(section.sides);
        const ft = toIntegerOrNull(section.length);
        const heightFt = toIntegerOrNull(section.height);
        const dsQty = toIntegerOrNull(section.downspoutQty);
        const gutterFt = Number(gutterFootages[index] || 0);
        const downspoutFt = Number(downspoutFootages[index] || 0);
        const gutterColor = String(colorNameById[String(section.colorId)] || "").trim();
        const downspoutColor = String(colorNameById[String(section.downspoutColorId)] || "").trim();

        const hasAnyValue =
          sides !== null ||
          ft !== null ||
          heightFt !== null ||
          dsQty !== null ||
          gutterFt > 0 ||
          downspoutFt > 0 ||
          hasValue(gutterColor) ||
          hasValue(downspoutColor);

        if (!hasAnyValue) return null;

        return {
          section: index + 1,
          gutterColor,
          sides,
          ft,
          heightFt,
          gutterFt,
          downspoutColor,
          dsQty,
          downspoutFt,
          endCapsRight: sides,
          endCapsLeft: sides,
        };
      })
      .filter(Boolean);
  }, [project, colorNameById, quoteResult]);

  const totalEndCapsNeeded = useMemo(
    () =>
      sectionBreakdownRows.reduce(
        (totals, row) => {
          const right = Number(row?.endCapsRight);
          const left = Number(row?.endCapsLeft);

          return {
            right: totals.right + (Number.isFinite(right) ? right : 0),
            left: totals.left + (Number.isFinite(left) ? left : 0),
          };
        },
        { right: 0, left: 0 }
      ),
    [sectionBreakdownRows]
  );

  const extrasMaterialRows = useMemo(() => {
    if (!project?.extrasIncluded) return [];
    return (project.extras || [])
      .map((extra) => {
        const description = String(extra.description || "").trim();
        const qty = Number(extra.qty);
        const unitPrice = Number(extra.unitPrice);
        const hasAnyValue =
          description !== "" || Number.isFinite(qty) || Number.isFinite(unitPrice);

        if (!hasAnyValue) return null;

        return {
          description: description || "—",
          qty: Number.isFinite(qty) ? Math.trunc(qty) : null,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
        };
      })
      .filter(Boolean);
  }, [project?.extrasIncluded, project?.extras]);

  const hasBreakdownData =
    sectionBreakdownRows.length > 0 || Boolean(selectedLeafGuardName) || extrasMaterialRows.length > 0;

  const saveProject = async () => {
    if (!project) return;

    const toIntOrNull = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
    };

    const toNumOrNull = (value) => {
      if (value === "" || value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    if (!project.statusId || !project.manufacturerId || !project.tripId) {
      toastError("Please select Status, Manufacturer, and Trip Rate before saving.", "Validation");
      return;
    }

    if (project.leafGuardIncluded && !project.leafGuardId) {
      toastError("Please select a Leaf Guard reference when Leaf Guard is included.", "Validation");
      return;
    }

    if (project.discountIncluded && !project.discountId) {
      toastError("Please select a Discount reference when Discount is included.", "Validation");
      return;
    }

    setSaving(true);

    try {
      const headerPayload = {
        project_name: project.projectName,
        customer: project.customer,
        project_address: project.projectAddress,
        status_id: toIntOrNull(project.statusId),
        date: project.date || null,
        trip_id: toIntOrNull(project.tripId),
        manufacturer_id: toIntOrNull(project.manufacturerId),
        discount_id: project.discountIncluded ? toIntOrNull(project.discountId) : null,
        request_link: project.requestLink,
        leaf_guard_id: project.leafGuardIncluded ? toIntOrNull(project.leafGuardId) : null,
        cstm_trip_rate: project.manualTripRateEnabled ? toNumOrNull(project.manualTripRate) : null,
        cstm_manufacturer_rate: project.manualManufacturerRateEnabled
          ? toNumOrNull(project.manualManufacturerRate)
          : null,
        cstm_discount_percentage: project.discountIncluded && project.manualDiscountRateEnabled
          ? normalizePercentRateValue(project.manualDiscountPercent)
          : null,
        cstm_leaf_guard_price: project.leafGuardIncluded && project.manualLeafGuardRateEnabled
          ? toNumOrNull(project.manualLeafGuardRate)
          : null,
        deposit_percent: project.depositIncluded ? toNumOrNull(project.depositPercent) : null,
      };

      const sideRows = (project.sections || [])
        .map((section, index) => {
          const segments = toIntOrNull(section.sides);
          const length = toNumOrNull(section.length);
          const height = toNumOrNull(section.height);
          const downspoutQty = toIntOrNull(section.downspoutQty);
          const gutterColorId = toIntOrNull(section.colorId);
          const downspoutColorId = toIntOrNull(section.downspoutColorId);
          const hasAnyValue =
            segments !== null ||
            length !== null ||
            height !== null ||
            downspoutQty !== null ||
            gutterColorId !== null ||
            downspoutColorId !== null;

          if (!hasAnyValue) return null;

          return {
            side_index: index + 1,
            segments,
            length,
            height,
            downspout_qty: downspoutQty,
            gutter_color_id: gutterColorId,
            downspout_color_id: downspoutColorId,
          };
        })
        .filter(Boolean);

      const extraRows = project.extrasIncluded
        ? (project.extras || [])
            .map((extra) => {
              const quantity = toIntOrNull(extra.qty);
              const unitPrice = toNumOrNull(extra.unitPrice);
              const name = String(extra.description || "").trim();
              const hasAnyValue = name !== "" || quantity !== null || unitPrice !== null;
              if (!hasAnyValue) return null;
              return {
                name,
                quantity,
                unit_price: unitPrice,
              };
            })
            .filter(Boolean)
        : [];

      const response = await fetch("/api/gutter/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          isEdit,
          projectId: isEdit ? toIntOrNull(projectId) : null,
          header: headerPayload,
          sides: sideRows,
          extras: extraRows,
        }),
      });

      const savePayload = await response.json().catch(() => ({}));

      if (!response.ok || !savePayload?.projId) {
        throw new Error(savePayload?.error || savePayload?.message || "Error saving project.");
      }

      const currentProjId = savePayload.projId;

      invalidateCacheKeys(
        [
          CACHE_KEYS.projectList,
          CACHE_KEYS.projectDetail(currentProjId),
          CACHE_KEYS.projectSides(currentProjId),
          CACHE_KEYS.projectExtras(currentProjId),
        ],
        { namespace: CACHE_NAMESPACE }
      );

      if (isEdit) {
        await loadData({ forceFresh: true });
        toastSuccess("Project saved.", "Gutter Project");
      } else {
        setProject((prev) => ({ ...prev, projId: currentProjId }));
        toastSuccess("Project saved.", "Gutter Project");
        startNavbarLoader();
        router.push(`/gutter/${currentProjId}`);
      }
    } catch (error) {
      toastError(error?.message || "Error saving project.", "Gutter Project");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";

  const fmtFootage = (n) => {
    const numeric = Number(n || 0);
    return Number.isFinite(numeric)
      ? numeric.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : "0";
  };

  const fmtCurrency = (n) => `$${fmt(Number(n || 0))}`;

  const displayOrDash = (value) => (hasValue(value) ? String(value).trim() : "—");
  const displayIntegerOrDash = (value) =>
    value === null || value === undefined || value === "" ? "—" : String(Math.trunc(Number(value)));

  const displayDate = project?.date
    ? new Date(project.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "—";

  if (loading && isEdit) return <Container className="py-4">Loading...</Container>;
  if (isEdit && !project) return <Container className="py-4">Project not found.</Container>;
  if (!project) return <Container className="py-4">Loading...</Container>;

  const title = isEdit ? "Edit Gutter Project" : "Gutter Project";
  const subtitle = isEdit
    ? project.projectName || project.projId || "—"
    : "Create or edit a gutter quote project";
  const toggleIdPrefix = isEdit ? `edit-${projectId}` : "new";
  const getToggleId = (name) => `gutter-toggle-${toggleIdPrefix}-${name}`;
  const moneyValueStyle = { minWidth: 136, fontVariantNumeric: "tabular-nums" };
  const discountAmount = Number(quoteResult?.pricing?.discountAmount || 0);
  const hasDiscount = discountAmount > 0;

  return (
    <Container className="py-4 gutter-quote-review-page" style={{ maxWidth: 1320 }}>
      <div className="d-flex justify-content-between align-items-center mb-3 gutter-print-toolbar">
        <div className="d-flex align-items-center">
          <Link href="/gutter" className="back-link me-3">
            <i className="bi bi-arrow-left" aria-hidden="true" /> Back
          </Link>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h2 className="mb-0 gutter-page-title">{title}</h2>
              <span className="text-muted small">
                ID: {project.projId ? String(project.projId) : "Auto-generated on save"}
              </span>
            </div>
            <p className="text-muted mb-0">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <Button variant="success" size="sm" onClick={saveProject} disabled={saving || refreshingSetup}>
            {saving ? "Saving..." : "Save Project"}
          </Button>
          {isEdit ? (
            <Link href={`/gutter/${projectId}/work-order`} className="btn btn-outline-primary btn-sm">
              Work Order
            </Link>
          ) : null}
          <Button type="button" variant="outline-secondary" size="sm" onClick={() => window.print()}>
            Print / PDF
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => void refreshSetupOptions()}
            disabled={refreshingSetup || saving}
          >
            <i className="bi bi-arrow-clockwise me-1" aria-hidden="true" />
            {refreshingSetup ? "Refreshing setup..." : "Refresh Setup Options"}
          </Button>
        </div>
      </div>

      <Row className="g-3 gutter-quote-review-grid">
        <Col lg={7} className="gutter-quote-form-pane">
          <Card className="mb-3 gutter-form-card">
            <Card.Header className="gutter-section-header">Project Details</Card.Header>
            <Card.Body className="gutter-card-body">
              <Row className="g-3 gutter-form-grid">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Status</Form.Label>
                    <Form.Select
                      className="quote-field-control"
                      value={project.statusId || ""}
                      onChange={(e) => updateField("statusId", e.target.value)}
                    >
                      <option value="">Select status...</option>
                      {statuses.map((s) => (
                        <option key={s.status_id} value={String(s.status_id)}>
                          {s.name}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Date</Form.Label>
                    <Form.Control
                      className="quote-field-control"
                      type="date"
                      value={project.date || ""}
                      onChange={(e) => updateField("date", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Customer</Form.Label>
                    <Form.Control
                      className="quote-field-control"
                      value={project.customer || ""}
                      onChange={(e) => updateField("customer", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Project Name</Form.Label>
                    <Form.Control
                      className="quote-field-control"
                      value={project.projectName || ""}
                      onChange={(e) => updateField("projectName", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Project Address</Form.Label>
                    <Form.Control
                      className="quote-field-control"
                      as="textarea"
                      rows={3}
                      value={project.projectAddress || ""}
                      onChange={(e) => updateField("projectAddress", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Request Link (Missive)</Form.Label>
                    <Form.Control
                      className="quote-field-control"
                      placeholder="Paste Missive request link"
                      value={project.requestLink || ""}
                      onChange={(e) => updateField("requestLink", e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-3 gutter-form-card">
            <Card.Header className="gutter-section-header">Manufacturer & Trip Fee</Card.Header>
            <Card.Body className="gutter-card-body">
              <Row className="g-3 gutter-form-grid">
                <Col md={project.manualManufacturerRateEnabled ? 6 : 9}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Manufacturer</Form.Label>
                    <Form.Select
                      className="quote-field-control"
                      value={project.manufacturerId || ""}
                      onChange={(e) => updateField("manufacturerId", e.target.value)}
                    >
                      <option value="">Select manufacturer...</option>
                      {manufacturers.map((m) => (
                        <option key={m.manufacturer_id} value={String(m.manufacturer_id)}>
                          {m.name} (${m.rate}/lf)
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3} className="d-flex align-items-end">
                  <div className="additionals-toggle-row toggle-inline-control">
                    <Form.Check
                      type="switch"
                      id={getToggleId("manufacturer-manual")}
                      className="m-0"
                      checked={Boolean(project.manualManufacturerRateEnabled)}
                      onChange={(e) => updateField("manualManufacturerRateEnabled", e.target.checked)}
                    />
                    <label className="additionals-toggle-label mb-0" htmlFor={getToggleId("manufacturer-manual")}>
                      Manual Rate
                    </label>
                  </div>
                </Col>
                {project.manualManufacturerRateEnabled ? (
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted mb-1">Manual Rate</Form.Label>
                      <Form.Control
                        className="quote-field-control"
                        type="number"
                        step="0.01"
                        value={project.manualManufacturerRate || ""}
                        onChange={(e) => updateField("manualManufacturerRate", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                ) : null}
                <Col md={project.manualTripRateEnabled ? 6 : 9}>
                  <Form.Group>
                    <Form.Label className="small text-muted mb-1">Trip Fee</Form.Label>
                    <Form.Select
                      className="quote-field-control"
                      value={project.tripId || ""}
                      onChange={(e) => updateField("tripId", e.target.value)}
                    >
                      <option value="">Select trip fee...</option>
                      {tripFeeRates.map((t) => (
                        <option key={t.trip_id} value={String(t.trip_id)}>
                          {t.label} (${t.rate})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={3} className="d-flex align-items-end">
                  <div className="additionals-toggle-row toggle-inline-control">
                    <Form.Check
                      type="switch"
                      id={getToggleId("trip-manual")}
                      className="m-0"
                      checked={Boolean(project.manualTripRateEnabled)}
                      onChange={(e) => updateField("manualTripRateEnabled", e.target.checked)}
                    />
                    <label className="additionals-toggle-label mb-0" htmlFor={getToggleId("trip-manual")}>
                      Manual Trip
                    </label>
                  </div>
                </Col>
                {project.manualTripRateEnabled ? (
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small text-muted mb-1">Manual Trip Rate</Form.Label>
                      <Form.Control
                        className="quote-field-control"
                        type="number"
                        step="0.01"
                        value={project.manualTripRate || ""}
                        onChange={(e) => updateField("manualTripRate", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                ) : null}
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-3 gutter-form-card">
            <Card.Header className="gutter-section-header d-flex justify-content-between align-items-center">
              <span className="fw-bold">
                Gutter and Downspout Sections ({(project.sections || []).length}/{MAX_DYNAMIC_SIDE_ROWS})
              </span>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={addSection}
                disabled={(project.sections || []).length >= MAX_DYNAMIC_SIDE_ROWS}
              >
                + Add Section
              </Button>
            </Card.Header>
            <Card.Body className="gutter-card-body">
              {(project.sections || []).map((section, i) => (
                <div key={i} className="section-input-card">
                  <div className="section-input-header">
                    <span className="section-input-title">Section {i + 1}</span>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      className="section-remove-btn"
                      disabled={(project.sections || []).length <= MIN_DYNAMIC_SIDE_ROWS}
                      onClick={() => removeSection(i)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="section-input-subsection">
                    <div className="section-input-subtitle">Gutter</div>
                    <Row className="g-3">
                      <Col md={6} lg={3}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Gutter Color</Form.Label>
                          <Form.Select
                            className="quote-field-control"
                            value={section.colorId || ""}
                            onChange={(e) => updateSection(i, "colorId", e.target.value)}
                          >
                            <option value="">Select...</option>
                            {colors.map((c) => (
                              <option key={c.color_id} value={String(c.color_id)}>
                                {c.name}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={6} lg={3}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Sides</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            min={MIN_SIDE_OR_DS_QTY}
                            max={MAX_SIDE_OR_DS_QTY}
                            step="1"
                            value={section.sides || ""}
                            onChange={(e) =>
                              updateSection(
                                i,
                                "sides",
                                normalizeBoundedInt(
                                  e.target.value,
                                  MIN_SIDE_OR_DS_QTY,
                                  MAX_SIDE_OR_DS_QTY
                                )
                              )
                            }
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6} lg={3}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Length (LF)</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            step="0.01"
                            value={section.length || ""}
                            onChange={(e) => updateSection(i, "length", e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6} lg={3}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Height (FT)</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            step="0.01"
                            value={section.height || ""}
                            onChange={(e) => updateSection(i, "height", e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </div>

                  <div className="section-input-subsection mt-3">
                    <div className="section-input-subtitle">Downspout</div>
                    <Row className="g-3">
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Downspout Color</Form.Label>
                          <Form.Select
                            className="quote-field-control"
                            value={section.downspoutColorId || ""}
                            onChange={(e) => updateSection(i, "downspoutColorId", e.target.value)}
                          >
                            <option value="">Select...</option>
                            {colors.map((c) => (
                              <option key={c.color_id} value={String(c.color_id)}>
                                {c.name}
                              </option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Downspout Quantity</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            min={MIN_SIDE_OR_DS_QTY}
                            max={MAX_SIDE_OR_DS_QTY}
                            step="1"
                            value={section.downspoutQty || ""}
                            onChange={(e) =>
                              updateSection(
                                i,
                                "downspoutQty",
                                normalizeBoundedInt(
                                  e.target.value,
                                  MIN_SIDE_OR_DS_QTY,
                                  MAX_SIDE_OR_DS_QTY
                                )
                              )
                            }
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </div>
                </div>
              ))}
            </Card.Body>
          </Card>

          <Card className="mb-3 gutter-form-card">
            <Card.Header className="gutter-section-header">Additionals</Card.Header>
            <Card.Body className="gutter-card-body">
              <div className="additionals-toggle-stack mb-3">
                <div className="additionals-toggle-row additionals-toggle-include">
                  <Form.Check
                    type="switch"
                    id={getToggleId("leaf-guard")}
                    className="m-0"
                    checked={Boolean(project.leafGuardIncluded)}
                    onChange={(e) => updateField("leafGuardIncluded", e.target.checked)}
                  />
                  <label className="additionals-toggle-label" htmlFor={getToggleId("leaf-guard")}>
                    Include Leaf Guard
                  </label>
                </div>
              </div>

              {project.leafGuardIncluded && (
                <Row className="g-3 mb-3">
                  <Col md={project.manualLeafGuardRateEnabled ? 5 : 9}>
                    <Form.Group>
                      <Form.Label className="small text-muted mb-1">Leaf Guard</Form.Label>
                      <Form.Select
                        className="quote-field-control"
                        value={project.leafGuardId || ""}
                        onChange={(e) => updateField("leafGuardId", e.target.value)}
                      >
                        <option value="">Select leaf guard...</option>
                        {leafGuards.map((lg) => (
                          <option key={lg.leaf_guard_id} value={String(lg.leaf_guard_id)}>
                            {lg.name} (${lg.price})
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3} className="d-flex align-items-end">
                    <div className="additionals-toggle-row toggle-inline-control">
                      <Form.Check
                        type="switch"
                        id={getToggleId("leaf-guard-manual")}
                        className="m-0"
                        checked={Boolean(project.manualLeafGuardRateEnabled)}
                        onChange={(e) => updateField("manualLeafGuardRateEnabled", e.target.checked)}
                      />
                      <label className="additionals-toggle-label" htmlFor={getToggleId("leaf-guard-manual")}>
                        Manual LG Price
                      </label>
                    </div>
                  </Col>
                  {project.manualLeafGuardRateEnabled ? (
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label className="small text-muted mb-1">Manual LG Price</Form.Label>
                        <Form.Control
                          className="quote-field-control"
                          type="number"
                          step="0.01"
                          placeholder="Manual LG price"
                          value={project.manualLeafGuardRate || ""}
                          onChange={(e) => updateField("manualLeafGuardRate", e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  ) : null}
                </Row>
              )}

              <div className="additionals-toggle-stack mb-3">
                <div className="additionals-toggle-row additionals-toggle-include">
                  <Form.Check
                    type="switch"
                    id={getToggleId("extras")}
                    className="m-0"
                    checked={Boolean(project.extrasIncluded)}
                    onChange={(e) => updateField("extrasIncluded", e.target.checked)}
                  />
                  <label className="additionals-toggle-label" htmlFor={getToggleId("extras")}>
                    Include Extras
                  </label>
                </div>
              </div>

              {project.extrasIncluded && (
                <div className="mb-3">
                  {(project.extras || []).map((extra, i) => (
                    <Row key={i} className="g-3 mb-2">
                      <Col md={5}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Description</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            placeholder="Description"
                            value={extra.description || ""}
                            onChange={(e) => updateExtra(i, "description", e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={2}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Qty</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            placeholder="Qty"
                            value={extra.qty || ""}
                            onChange={(e) => updateExtra(i, "qty", e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={3}>
                        <Form.Group>
                          <Form.Label className="small text-muted mb-1">Unit Price</Form.Label>
                          <Form.Control
                            className="quote-field-control"
                            type="number"
                            step="0.01"
                            placeholder="Unit Price"
                            value={extra.unitPrice || ""}
                            onChange={(e) => updateExtra(i, "unitPrice", e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                      <Col md={2} className="d-flex align-items-end">
                        <Button variant="outline-secondary" size="sm" onClick={() => removeExtra(i)}>
                          <i className="bi bi-trash" aria-hidden="true" />
                        </Button>
                      </Col>
                    </Row>
                  ))}
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={addExtra}
                    disabled={(project.extras || []).length >= 4}
                    className="mt-1"
                  >
                    + Add Extra
                  </Button>
                </div>
              )}

              <div className="additionals-toggle-stack mb-3">
                <div className="additionals-toggle-row additionals-toggle-include">
                  <Form.Check
                    type="switch"
                    id={getToggleId("discount")}
                    className="m-0"
                    checked={Boolean(project.discountIncluded)}
                    onChange={(e) => updateField("discountIncluded", e.target.checked)}
                  />
                  <label className="additionals-toggle-label" htmlFor={getToggleId("discount")}>
                    Include Discount
                  </label>
                </div>
              </div>

              {project.discountIncluded && (
                <Row className="g-3 mb-3">
                  <Col md={project.manualDiscountRateEnabled ? 6 : 9}>
                    <Form.Group>
                      <Form.Label className="small text-muted mb-1">Discount</Form.Label>
                      <Form.Select
                        className="quote-field-control"
                        value={project.discountId || ""}
                        onChange={(e) => updateField("discountId", e.target.value)}
                      >
                        <option value="">Select discount...</option>
                        {discounts.map((d) => (
                          <option key={d.discount_id} value={String(d.discount_id)}>
                            {formatPercentLabel(d.percentage)}% - {d.description}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3} className="d-flex align-items-end">
                    <div className="additionals-toggle-row toggle-inline-control">
                      <Form.Check
                        type="switch"
                        id={getToggleId("discount-manual")}
                        className="m-0"
                        checked={Boolean(project.manualDiscountRateEnabled)}
                        onChange={(e) => updateField("manualDiscountRateEnabled", e.target.checked)}
                      />
                      <label className="additionals-toggle-label" htmlFor={getToggleId("discount-manual")}>
                        Manual %
                      </label>
                    </div>
                  </Col>
                  {project.manualDiscountRateEnabled ? (
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label className="small text-muted mb-1">Manual %</Form.Label>
                        <Form.Control
                          className="quote-field-control"
                          type="number"
                          step="0.0001"
                          min="0"
                          max="1"
                          value={project.manualDiscountPercent || ""}
                          onChange={(e) => updateField("manualDiscountPercent", e.target.value)}
                        />
                      </Form.Group>
                    </Col>
                  ) : null}
                </Row>
              )}

              <div className="additionals-toggle-stack mb-2">
                <div className="additionals-toggle-row additionals-toggle-include">
                  <Form.Check
                    type="switch"
                    id={getToggleId("deposit")}
                    className="m-0"
                    checked={Boolean(project.depositIncluded)}
                    onChange={(e) => {
                      updateField("depositIncluded", e.target.checked);
                      if (!e.target.checked) {
                        updateField("depositPercent", "");
                      }
                    }}
                  />
                  <label className="additionals-toggle-label" htmlFor={getToggleId("deposit")}>
                    Include Deposit
                  </label>
                </div>
              </div>

              {project.depositIncluded && (
                <Form.Group className="mt-2" style={{ maxWidth: 260 }}>
                  <Form.Label className="small text-muted mb-1">Deposit (%)</Form.Label>
                  <Form.Control
                    className="quote-field-control"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={project.depositPercent || ""}
                    onChange={(e) =>
                      updateField("depositPercent", normalizeBoundedPercent(e.target.value, 0, 100))
                    }
                  />
                  <Form.Text className="text-muted">Enter percentage (e.g. 20 for 20%).</Form.Text>
                </Form.Group>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5} className="gutter-quote-preview-pane">
          <Card className="border-0 bg-transparent quote-preview-shell">
            <Card.Header className="gutter-section-header bg-transparent px-0">Quote Preview</Card.Header>
            <Card.Body className="px-0">
              {quoteResult?.gated ? (
                <p className="text-muted">{quoteResult.message}</p>
              ) : quoteResult?.pricing ? (
                <>
                  <div className="quote-document p-3 mx-auto" style={{ maxWidth: 560 }}>
                    <div className="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <h4 className="mb-1 fw-bold">{displayOrDash(companyProfile.name)}</h4>
                        <div className="small text-muted">{displayOrDash(companyProfile.email)}</div>
                        <div className="small text-muted">{displayOrDash(companyProfile.phone)}</div>
                      </div>
                      <div className="text-end small">
                        <div className="mb-1">
                          <span className="text-muted me-1">Date</span>
                          <span className="fw-medium">{displayDate}</span>
                        </div>
                        <div>
                          <span className="text-muted me-1">Project ID</span>
                          <span className="fw-medium">
                            {project.projId ? String(project.projId) : "Auto-generated"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="quote-divider my-2" />

                    <div className="mb-4">
                      <div className="small text-uppercase text-muted fw-semibold mb-2">Project Details</div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Customer</span>
                        <span className="fw-medium text-end ms-3">{displayOrDash(project.customer)}</span>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Project Name</span>
                        <span className="fw-medium text-end ms-3">{displayOrDash(project.projectName)}</span>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Address</span>
                        <span className="fw-medium text-end ms-3">{displayOrDash(project.projectAddress)}</span>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Manufacturer</span>
                        <span className="fw-medium text-end ms-3">{displayOrDash(selectedManufacturerName)}</span>
                      </div>
                    </div>

                    <div className="mb-4 quote-pricing-summary">
                      <h5 className="mb-3 fw-semibold">Pricing Summary</h5>

                      <div className="quote-price-row">
                        <span>Gutter k Style 6 Inch</span>
                        <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.materialCost)}</span>
                      </div>
                      <div className="quote-price-subline">
                        Total Gutter FT ({fmtFootage(quoteResult.pricing.totalGutter)})
                      </div>
                      <div className="quote-price-row">
                        <span>3x4 Downspouts</span>
                        <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.downspoutCost)}</span>
                      </div>
                      <div className="quote-price-subline">
                        Total Downspout FT ({fmtFootage(quoteResult.pricing.totalDownspouts)})
                      </div>
                      {Number(quoteResult.pricing.leafGuardCost || 0) > 0 && (
                        <div className="quote-price-row">
                          <span>Leaf Guard</span>
                          <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.leafGuardCost)}</span>
                        </div>
                      )}
                      {Number(quoteResult.pricing.extrasPrice || 0) > 0 && (
                        <div className="quote-price-row">
                          <span>Extras</span>
                          <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.extrasPrice)}</span>
                        </div>
                      )}

                      <div className="quote-price-gap" />

                      <div className="quote-price-row">
                        <span className="text-muted">Subtotal</span>
                        <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.subtotal)}</span>
                      </div>
                      <div className={`quote-price-row ${hasDiscount ? "quote-price-negative" : "text-muted"}`}>
                        <span>Discount ({(quoteResult.pricing.discountPercent * 100).toFixed(2)}%)</span>
                        <span className="quote-price-value" style={moneyValueStyle}>
                          {hasDiscount ? `-${fmtCurrency(discountAmount)}` : fmtCurrency(0)}
                        </span>
                      </div>

                      <div className="quote-price-gap" />

                      <div className="quote-price-row quote-price-row-total align-items-end">
                        <span className="quote-total-label">Project Total</span>
                        <span className="quote-total-value text-end" style={moneyValueStyle}>
                          {fmtCurrency(quoteResult.pricing.projectTotal)}
                        </span>
                      </div>

                      <div
                        className={`quote-price-row mt-2 ${Number(quoteResult.pricing.depositPercentDisplay || 0) > 0 ? "quote-price-row-deposit-active" : ""}`}
                      >
                        <span className="text-muted">Deposit ({fmt(quoteResult.pricing.depositPercentDisplay)}%)</span>
                        <span className="quote-price-value" style={moneyValueStyle}>{fmtCurrency(quoteResult.pricing.depositAmount)}</span>
                      </div>
                      <div className="quote-price-row align-items-end">
                        <span className="fw-semibold">Remaining Balance</span>
                        <span className="quote-balance-value text-end" style={moneyValueStyle}>
                          {fmtCurrency(quoteResult.pricing.remainingBalance)}
                        </span>
                      </div>
                    </div>

                    {hasBreakdownData && (
                      <div className="pt-3" style={{ borderTop: "5px solid #000000" }}>
                        <div className="small text-uppercase text-muted fw-semibold mb-3">Material Details</div>

                        <div className="mb-3">
                          <div className="fw-semibold mb-2">Section Details</div>
                          <div className="material-sections-stack">
                            {sectionBreakdownRows.map((row) => (
                              <article className="material-section-card" key={`section-breakdown-${row.section}`}>
                                <div className="material-section-header">Section {row.section}</div>

                                <div className="material-section-block">
                                  <div className="material-section-block-title">Gutter k Style 6 Inch</div>
                                  <div className="material-section-fields material-section-fields-gutter">
                                    <div className="material-section-field">
                                      <span className="material-section-label">Sides</span>
                                      <span className="material-section-value">{displayIntegerOrDash(row.sides)}</span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Color</span>
                                      <span className="material-section-value">{displayOrDash(row.gutterColor)}</span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Length</span>
                                      <span className="material-section-value">
                                        {row.ft === null ? "—" : `${displayIntegerOrDash(row.ft)} FT`}
                                      </span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Height</span>
                                      <span className="material-section-value">
                                        {row.heightFt === null ? "—" : `${displayIntegerOrDash(row.heightFt)} FT`}
                                      </span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Gutter FT</span>
                                      <span className="material-section-value">{fmt(row.gutterFt)} FT</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="material-section-block">
                                  <div className="material-section-block-title"> 3x4 Downspouts</div>
                                  <div className="material-section-fields material-section-fields-downspout-detail">
                                    <div className="material-section-field">
                                      <span className="material-section-label">Color</span>
                                      <span className="material-section-value">{displayOrDash(row.downspoutColor)}</span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Quantity</span>
                                      <span className="material-section-value">{displayIntegerOrDash(row.dsQty)}</span>
                                    </div>
                                    <div className="material-section-field">
                                      <span className="material-section-label">Downspout FT</span>
                                      <span className="material-section-value">{fmt(row.downspoutFt)} FT</span>
                                    </div>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>

                        {sectionBreakdownRows.length > 0 ? (
                          <div className="mb-3">
                            <div className="fw-semibold mb-2">End Caps Totals</div>
                            <article className="material-section-card material-section-card-compact">
                              <div className="material-section-block">
                                <div className="material-section-fields material-section-fields-downspout">
                                  <div className="material-section-field">
                                    <span className="material-section-label">Total Right End Caps Needed</span>
                                    <span className="material-section-value">
                                      {displayIntegerOrDash(totalEndCapsNeeded.right)}
                                    </span>
                                  </div>
                                  <div className="material-section-field">
                                    <span className="material-section-label">Total Left End Caps Needed</span>
                                    <span className="material-section-value">
                                      {displayIntegerOrDash(totalEndCapsNeeded.left)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {selectedLeafGuardName ? (
                          <div className="mb-3">
                            <div className="fw-semibold mb-2">Leaf Guard</div>
                            <article className="material-section-card">
                              <div className="material-section-block">
                                <div className="material-section-fields material-section-fields-single">
                                  <div className="material-section-field">
                                    <span className="material-section-label">Name</span>
                                    <span className="material-section-value">{selectedLeafGuardName}</span>
                                  </div>
                                </div>
                              </div>
                            </article>
                          </div>
                        ) : null}

                        {extrasMaterialRows.length > 0 ? (
                          <div className="mb-1">
                            <div className="fw-semibold mb-2">Extras</div>
                            <div className="material-sections-stack">
                              {extrasMaterialRows.map((extra, index) => (
                                <article className="material-section-card" key={`extra-material-${index}`}>
                                  <div className="material-section-header">Extra {index + 1}</div>
                                  <div className="material-section-block">
                                    <div className="material-section-fields material-section-fields-extra">
                                      <div className="material-section-field">
                                        <span className="material-section-label">Description</span>
                                        <span className="material-section-value">{displayOrDash(extra.description)}</span>
                                      </div>
                                      <div className="material-section-field">
                                        <span className="material-section-label">Quantity</span>
                                        <span className="material-section-value">{displayIntegerOrDash(extra.qty)}</span>
                                      </div>
                                      <div className="material-section-field">
                                        <span className="material-section-label">Price (Per Item)</span>
                                        <span className="material-section-value">{fmtCurrency(extra.unitPrice || 0)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted">Enter project details to see preview.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
