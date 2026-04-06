"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import Link from "next/link";
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  Table,
  Alert,
} from "react-bootstrap";
import { supabase } from "@/infrastructure/supabase/client";
import { calculateQuote } from "@/modules/gutter/services/gutter.service";
import {
  createCacheKey,
  invalidateCacheKeys,
} from "@/core/cache";
import { getSupabaseSelectWithCache } from "@/core/cache";

const emptySection = () => ({
  colorId: "",
  sides: "",
  length: "",
  height: "",
  downspoutQty: "",
});
const emptyExtra = () => ({ description: "", qty: "", unitPrice: "" });
const MIN_DYNAMIC_SIDE_ROWS = 1;
const MAX_DYNAMIC_SIDE_ROWS = 10;
const MIN_SIDE_OR_DS_QTY = 1;
const MAX_SIDE_OR_DS_QTY = 10;
const CACHE_NAMESPACE = "psb-universe";
const PROJECT_DATA_TTL_MS = 5 * 60 * 1000;
const CACHE_KEYS = {
  statuses: createCacheKey("setup", "statuses"),
  colors: createCacheKey("setup", "colors"),
  manufacturers: createCacheKey("setup", "manufacturers"),
  leafGuards: createCacheKey("setup", "leafGuards"),
  tripRates: createCacheKey("setup", "tripRates"),
  discounts: createCacheKey("setup", "discounts"),
  projectList: createCacheKey("projects", "list"),
  projectDetail: (projId) => createCacheKey("projects", "detail", projId),
  projectSides: (projId) => createCacheKey("projects", "sides", projId),
  projectExtras: (projId) => createCacheKey("projects", "extras", projId),
};

export default function GutterProjectEditPage({ params }) {
  const { id } = use(params);

  const [setup, setSetup] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [colors, setColors] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [leafGuards, setLeafGuards] = useState([]);
  const [tripFeeRates, setTripFeeRates] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [project, setProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadAll = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    if (forceFresh) {
      setLoading(true);
    }

    try {
      const [statusRes, colorRes, mfgRes, lgRes, tfRes, discRes, projRes, sidesRes, extrasRes] =
        await Promise.all([
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.statuses,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_statuses",
              select: "*",
              orderBy: "status_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.colors,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_colors",
              select: "*",
              orderBy: "color_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.manufacturers,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_manufacturers",
              select: "*",
              orderBy: "manufacturer_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.leafGuards,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_leaf_guards",
              select: "*",
              orderBy: "leaf_guard_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.tripRates,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_trip_rates",
              select: "*",
              orderBy: "trip_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.discounts,
            namespace: CACHE_NAMESPACE,
            forceFresh,
            query: {
              table: "gtr_s_discounts",
              select: "*",
              orderBy: "discount_id",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.projectDetail(id),
            namespace: CACHE_NAMESPACE,
            ttlMs: PROJECT_DATA_TTL_MS,
            forceFresh,
            query: {
              table: "gtr_t_projects",
              select: "*",
              filters: [{ column: "proj_id", op: "eq", value: id }],
              single: true,
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.projectSides(id),
            namespace: CACHE_NAMESPACE,
            ttlMs: PROJECT_DATA_TTL_MS,
            forceFresh,
            query: {
              table: "gtr_m_project_sides",
              select: "*",
              filters: [{ column: "proj_id", op: "eq", value: id }],
              orderBy: "side_index",
            },
          }),
          getSupabaseSelectWithCache({
            cacheKey: CACHE_KEYS.projectExtras(id),
            namespace: CACHE_NAMESPACE,
            ttlMs: PROJECT_DATA_TTL_MS,
            forceFresh,
            query: {
              table: "gtr_m_project_extras",
              select: "*",
              filters: [{ column: "proj_id", op: "eq", value: id }],
              orderBy: "extra_id",
            },
          }),
        ]);

      setStatuses(statusRes.data || []);
      setColors(colorRes.data || []);
      setManufacturers(mfgRes.data || []);
      setLeafGuards(lgRes.data || []);
      setTripFeeRates(tfRes.data || []);
      setDiscounts(discRes.data || []);

      const m = mfgRes.data || [];
      const lg = lgRes.data || [];
      const tf = tfRes.data || [];
      setSetup({
        materialManufacturer: m.map((r) => ({ id: r.manufacturer_id, name: r.name, rate: r.rate })),
        leafGuard: lg.map((r) => ({ id: r.leaf_guard_id, name: r.name, price: r.price })),
        tripRates: tf.map((r) => ({ id: r.trip_id, label: r.label, rate: r.rate })),
        discounts: (discRes.data || []).map((r) => ({ id: r.discount_id, percent: r.percentage })),
      });

      const header = projRes.data;
      if (header) {
        const mappedSections = (sidesRes.data || []).map((side) => ({
          colorId: side.gutter_color_id ? String(side.gutter_color_id) : "",
          sides: side.segments !== null && side.segments !== undefined ? String(side.segments) : "",
          length: side.length !== null && side.length !== undefined ? String(side.length) : "",
          height: side.height !== null && side.height !== undefined ? String(side.height) : "",
          downspoutQty:
            side.downspout_qty !== null && side.downspout_qty !== undefined
              ? String(side.downspout_qty)
              : "",
        }));

        const mappedExtras = (extrasRes.data || []).map((extra) => ({
          description: extra.name || "",
          qty: extra.quantity !== null && extra.quantity !== undefined ? String(extra.quantity) : "",
          unitPrice:
            extra.unit_price !== null && extra.unit_price !== undefined ? String(extra.unit_price) : "",
        }));

        const hasCustomManufacturerRate =
          header.cstm_manufacturer_rate !== null && header.cstm_manufacturer_rate !== undefined;
        const hasCustomTripRate = header.cstm_trip_rate !== null && header.cstm_trip_rate !== undefined;
        const hasCustomLeafGuardRate =
          header.cstm_leaf_guard_price !== null && header.cstm_leaf_guard_price !== undefined;
        const hasCustomDiscountPercent =
          header.cstm_discount_percentage !== null &&
          header.cstm_discount_percentage !== undefined;
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

        setProject({
          projId: header.proj_id,
          statusId: header.status_id ? String(header.status_id) : "",
          requestLink: header.request_link || "",
          customer: header.customer || "",
          date: header.date || "",
          projectName: header.project_name || "",
          projectAddress: header.project_address || "",
          manufacturerId: header.manufacturer_id ? String(header.manufacturer_id) : "",
          manualManufacturerRateEnabled: hasCustomManufacturerRate,
          manualManufacturerRate: hasCustomManufacturerRate
            ? String(header.cstm_manufacturer_rate)
            : "",
          tripId: header.trip_id ? String(header.trip_id) : "",
          manualTripRateEnabled: hasCustomTripRate,
          manualTripRate: hasCustomTripRate ? String(header.cstm_trip_rate) : "",
          tripHours: "",
          tripHourlyRate: "",
          sections: mappedSections.length > 0 ? mappedSections : [emptySection()],
          leafGuardIncluded: Boolean(header.leaf_guard_id || hasCustomLeafGuardRate),
          leafGuardId: header.leaf_guard_id ? String(header.leaf_guard_id) : "",
          manualLeafGuardRateEnabled: hasCustomLeafGuardRate,
          manualLeafGuardRate: hasCustomLeafGuardRate
            ? String(header.cstm_leaf_guard_price)
            : "",
          extrasIncluded: mappedExtras.length > 0,
          extras: mappedExtras.length > 0 ? mappedExtras : [emptyExtra()],
          discountIncluded: Boolean(header.discount_id || hasCustomDiscountPercent),
          discountId: header.discount_id ? String(header.discount_id) : "",
          manualDiscountRateEnabled: hasCustomDiscountPercent,
          manualDiscountPercent: hasCustomDiscountPercent
            ? String(header.cstm_discount_percentage)
            : "",
          discountPercent: "",
          downspoutUnitPrice: "",
          downspoutPipeLength: "",
          hangerRate: "",
          endCapUnitPrice: "",
          depositPercent: depositPercentDisplay === "" ? "" : String(depositPercentDisplay),
        });
      }
    } catch (error) {
      console.error("Failed to load project data", error);
      setMessage("Error loading project data.");
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadAll]);

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

  const updateSection = (index, field, value) => {
    setProject((prev) => {
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [field]: value };
      return { ...prev, sections };
    });
  };

  const addSection = () => {
    if ((project.sections || []).length >= MAX_DYNAMIC_SIDE_ROWS) return;
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
    if ((project.extras || []).length >= 4) return;
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

  const saveProject = async () => {
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
      setMessage("Please select Status, Manufacturer, and Trip Rate before saving.");
      return;
    }

    if (project.leafGuardIncluded && !project.leafGuardId) {
      setMessage("Please select a Leaf Guard reference when Leaf Guard is included.");
      return;
    }

    if (project.discountIncluded && !project.discountId) {
      setMessage("Please select a Discount reference when Discount is included.");
      return;
    }

    setSaving(true);
    setMessage("");
    const now = new Date().toISOString();
    const { error: headerError } = await supabase
      .from("gtr_t_projects")
      .update({
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
        cstm_discount_percentage: project.manualDiscountRateEnabled
          ? toNumOrNull(project.manualDiscountPercent)
          : null,
        cstm_leaf_guard_price: project.manualLeafGuardRateEnabled
          ? toNumOrNull(project.manualLeafGuardRate)
          : null,
        deposit_percent: toNumOrNull(project.depositPercent),
        updated_at: now,
      })
      .eq("proj_id", id);

    if (headerError) {
      setMessage("Error saving project: " + headerError.message);
      setSaving(false);
      return;
    }

    const { error: clearSidesError } = await supabase
      .from("gtr_m_project_sides")
      .delete()
      .eq("proj_id", id);

    if (clearSidesError) {
      setMessage("Error clearing existing sides: " + clearSidesError.message);
      setSaving(false);
      return;
    }

    const sideRows = (project.sections || [])
      .map((section, index) => {
        const segments = toIntOrNull(section.sides);
        const length = toNumOrNull(section.length);
        const height = toNumOrNull(section.height);
        const downspoutQty = toIntOrNull(section.downspoutQty);
        const colorId = toIntOrNull(section.colorId);
        const hasAnyValue =
          segments !== null ||
          length !== null ||
          height !== null ||
          downspoutQty !== null ||
          colorId !== null;

        if (!hasAnyValue) return null;

        return {
          proj_id: toIntOrNull(id),
          side_index: index + 1,
          segments,
          length,
          height,
          downspout_qty: downspoutQty,
          gutter_color_id: colorId,
          downspout_color_id: colorId,
        };
      })
      .filter(Boolean);

    if (sideRows.length > 0) {
      const { error: insertSidesError } = await supabase
        .from("gtr_m_project_sides")
        .insert(sideRows);

      if (insertSidesError) {
        setMessage("Error saving sides: " + insertSidesError.message);
        setSaving(false);
        return;
      }
    }

    const { error: clearExtrasError } = await supabase
      .from("gtr_m_project_extras")
      .delete()
      .eq("proj_id", id);

    if (clearExtrasError) {
      setMessage("Error clearing existing extras: " + clearExtrasError.message);
      setSaving(false);
      return;
    }

    const extraRows = project.extrasIncluded
      ? (project.extras || [])
          .map((extra) => {
            const quantity = toIntOrNull(extra.qty);
            const unitPrice = toNumOrNull(extra.unitPrice);
            const name = String(extra.description || "").trim();
            const hasAnyValue = name !== "" || quantity !== null || unitPrice !== null;
            if (!hasAnyValue) return null;
            return {
              proj_id: toIntOrNull(id),
              name,
              quantity,
              unit_price: unitPrice,
            };
          })
          .filter(Boolean)
      : [];

    if (extraRows.length > 0) {
      const { error: insertExtrasError } = await supabase
        .from("gtr_m_project_extras")
        .insert(extraRows);

      if (insertExtrasError) {
        setMessage("Error saving extras: " + insertExtrasError.message);
        setSaving(false);
        return;
      }
    }

    invalidateCacheKeys(
      [
        CACHE_KEYS.projectList,
        CACHE_KEYS.projectDetail(id),
        CACHE_KEYS.projectSides(id),
        CACHE_KEYS.projectExtras(id),
      ],
      { namespace: CACHE_NAMESPACE }
    );

    await loadAll({ forceFresh: true });
    setMessage("Project saved.");
    setSaving(false);
  };

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "--";

  const fmtQty = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : "--";

  if (loading) return <Container className="py-4">Loading...</Container>;
  if (!project) return <Container className="py-4">Project not found.</Container>;

  return (
    <Container className="py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/gutter" className="back-link me-3">
          ΓåÉ Back
        </Link>
        <div>
          <h2 className="mb-0">Edit Gutter Project</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
            {project.projectName || project.projId}
          </p>
        </div>
      </div>

      {message && (
        <Alert
          variant={message.includes("Error") ? "danger" : "success"}
          dismissible
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      )}

      <Row>
        <Col lg={7}>
          <Card className="mb-3">
            <Card.Header className="fw-bold">Project Details</Card.Header>
            <Card.Body>
              <Row className="g-2">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small">Project ID</Form.Label>
                    <Form.Control size="sm" value={project.projId || "--"} readOnly />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small">Status</Form.Label>
                    <Form.Select
                      size="sm"
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
                    <Form.Label className="small">Customer</Form.Label>
                    <Form.Control
                      size="sm"
                      value={project.customer || ""}
                      onChange={(e) => updateField("customer", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small">Date</Form.Label>
                    <Form.Control
                      size="sm"
                      type="date"
                      value={project.date || ""}
                      onChange={(e) => updateField("date", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label className="small">Project Name</Form.Label>
                    <Form.Control
                      size="sm"
                      value={project.projectName || ""}
                      onChange={(e) => updateField("projectName", e.target.value)}
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Form.Group>
                    <Form.Label className="small">Project Address</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={2}
                      size="sm"
                      value={project.projectAddress || ""}
                      onChange={(e) =>
                        updateField("projectAddress", e.target.value)
                      }
                    />
                  </Form.Group>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header className="fw-bold">Manufacturer & Trip Fee</Card.Header>
            <Card.Body>
              <Row className="g-2">
                <Col md={6}>
                  <Form.Select
                    size="sm"
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
                </Col>
                <Col md={3}>
                  <Form.Check
                    label="Manual Rate"
                    checked={!!project.manualManufacturerRateEnabled}
                    onChange={(e) =>
                      updateField("manualManufacturerRateEnabled", e.target.checked)
                    }
                  />
                </Col>
                <Col md={3}>
                  <Form.Control
                    size="sm"
                    type="number"
                    step="0.01"
                    disabled={!project.manualManufacturerRateEnabled}
                    value={project.manualManufacturerRate || ""}
                    onChange={(e) =>
                      updateField("manualManufacturerRate", e.target.value)
                    }
                  />
                </Col>
                <Col md={6}>
                  <Form.Select
                    size="sm"
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
                </Col>
                <Col md={3}>
                  <Form.Check
                    label="Manual Trip"
                    checked={!!project.manualTripRateEnabled}
                    onChange={(e) =>
                      updateField("manualTripRateEnabled", e.target.checked)
                    }
                  />
                </Col>
                <Col md={3}>
                  <Form.Control
                    size="sm"
                    type="number"
                    step="0.01"
                    disabled={!project.manualTripRateEnabled}
                    value={project.manualTripRate || ""}
                    onChange={(e) => updateField("manualTripRate", e.target.value)}
                  />
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-bold">
                Gutter Sections ({(project.sections || []).length}/{MAX_DYNAMIC_SIDE_ROWS})
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
            <Card.Body>
              {(project.sections || []).map((section, i) => (
                <div key={i} className="border rounded p-2 mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong className="small">Section #{i + 1}</strong>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      disabled={(project.sections || []).length <= MIN_DYNAMIC_SIDE_ROWS}
                      onClick={() => removeSection(i)}
                    >
                      Remove
                    </Button>
                  </div>
                  <Row className="g-2">
                    <Col md={3}>
                      <Form.Select
                        size="sm"
                        value={section.colorId || ""}
                        onChange={(e) => updateSection(i, "colorId", e.target.value)}
                      >
                        <option value="">Color...</option>
                        {colors.map((c) => (
                          <option key={c.color_id} value={String(c.color_id)}>{c.name}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        min={MIN_SIDE_OR_DS_QTY}
                        max={MAX_SIDE_OR_DS_QTY}
                        step="1"
                        placeholder="Sides"
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
                    </Col>
                    <Col md={3}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="Length"
                        value={section.length || ""}
                        onChange={(e) => updateSection(i, "length", e.target.value)}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="Height"
                        value={section.height || ""}
                        onChange={(e) => updateSection(i, "height", e.target.value)}
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        min={MIN_SIDE_OR_DS_QTY}
                        max={MAX_SIDE_OR_DS_QTY}
                        step="1"
                        placeholder="DS Qty"
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
                    </Col>
                  </Row>
                </div>
              ))}
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header className="fw-bold">Additionals</Card.Header>
            <Card.Body>
              <Form.Check
                label="Include Leaf Guard"
                className="mb-2"
                checked={!!project.leafGuardIncluded}
                onChange={(e) => updateField("leafGuardIncluded", e.target.checked)}
              />
              {project.leafGuardIncluded && (
                <Row className="g-2 mb-3">
                  <Col md={5}>
                    <Form.Select
                      size="sm"
                      value={project.leafGuardId || ""}
                      onChange={(e) => updateField("leafGuardId", e.target.value)}
                    >
                      <option value="">Select leaf guard...</option>
                      {leafGuards.map((lg) => (
                        <option key={lg.leaf_guard_id} value={String(lg.leaf_guard_id)}>
                          {lg.name} (${lg.price}/lf)
                        </option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={3}>
                    <Form.Check
                      label="Manual LG Rate"
                      checked={!!project.manualLeafGuardRateEnabled}
                      onChange={(e) =>
                        updateField("manualLeafGuardRateEnabled", e.target.checked)
                      }
                    />
                  </Col>
                  <Col md={4}>
                    <Form.Control
                      size="sm"
                      type="number"
                      step="0.01"
                      placeholder="Manual LG rate"
                      disabled={!project.manualLeafGuardRateEnabled}
                      value={project.manualLeafGuardRate || ""}
                      onChange={(e) => updateField("manualLeafGuardRate", e.target.value)}
                    />
                  </Col>
                </Row>
              )}

              <Form.Check
                label="Include Extras"
                className="mb-2"
                checked={!!project.extrasIncluded}
                onChange={(e) => updateField("extrasIncluded", e.target.checked)}
              />
              {project.extrasIncluded && (
                <div className="mb-3">
                  {(project.extras || []).map((extra, i) => (
                    <Row key={i} className="g-2 mb-1">
                      <Col md={5}>
                        <Form.Control
                          size="sm"
                          placeholder="Description"
                          value={extra.description || ""}
                          onChange={(e) => updateExtra(i, "description", e.target.value)}
                        />
                      </Col>
                      <Col md={2}>
                        <Form.Control
                          size="sm"
                          type="number"
                          placeholder="Qty"
                          value={extra.qty || ""}
                          onChange={(e) => updateExtra(i, "qty", e.target.value)}
                        />
                      </Col>
                      <Col md={3}>
                        <Form.Control
                          size="sm"
                          type="number"
                          step="0.01"
                          placeholder="Unit Price"
                          value={extra.unitPrice || ""}
                          onChange={(e) => updateExtra(i, "unitPrice", e.target.value)}
                        />
                      </Col>
                      <Col md={2}>
                        <Button variant="outline-danger" size="sm" onClick={() => removeExtra(i)}>
                          ├ù
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

              <Form.Check
                label="Include Discount"
                className="mb-2"
                checked={!!project.discountIncluded}
                onChange={(e) => updateField("discountIncluded", e.target.checked)}
              />
              {project.discountIncluded && (
                <Row className="g-2">
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="small">Discount</Form.Label>
                      <Form.Select
                        size="sm"
                        value={project.discountId || ""}
                        onChange={(e) => updateField("discountId", e.target.value)}
                      >
                        <option value="">Select discount...</option>
                        {discounts.map((d) => (
                          <option key={d.discount_id} value={String(d.discount_id)}>
                            {(Number(d.percentage || 0) * 100).toFixed(0)}% - {d.description}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Check
                      className="mt-4"
                      label="Manual Discount %"
                      checked={!!project.manualDiscountRateEnabled}
                      onChange={(e) =>
                        updateField("manualDiscountRateEnabled", e.target.checked)
                      }
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="small">Manual % (0-1)</Form.Label>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        disabled={!project.manualDiscountRateEnabled}
                        value={project.manualDiscountPercent || ""}
                        onChange={(e) => updateField("manualDiscountPercent", e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>
              )}

              <Form.Group className="mt-3">
                <Form.Label className="small">Deposit (%)</Form.Label>
                <Form.Control
                  size="sm"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={project.depositPercent || ""}
                  onChange={(e) => updateField("depositPercent", e.target.value)}
                  style={{ maxWidth: 200 }}
                />
              </Form.Group>
            </Card.Body>
          </Card>

          <div className="d-flex gap-2 mb-4">
            <Button variant="success" onClick={saveProject} disabled={saving}>
              {saving ? "Saving..." : "Save Project"}
            </Button>
            <Button variant="outline-secondary" onClick={() => window.print()}>
              Print / PDF
            </Button>
            <Link
              href={`/gutter/${id}/work-order`}
              className="btn btn-outline-primary"
            >
              Work Order
            </Link>
          </div>
        </Col>

        <Col lg={5}>
          <Card className="sticky-top" style={{ top: "1rem" }}>
            <Card.Header className="fw-bold">Quote Preview</Card.Header>
            <Card.Body>
              {quoteResult?.gated ? (
                <p className="text-muted">{quoteResult.message}</p>
              ) : quoteResult?.pricing ? (
                <Table size="sm" bordered>
                  <tbody>
                    <tr>
                      <td className="small text-muted">Total Gutter</td>
                      <td className="text-end">{fmt(quoteResult.pricing.totalGutter)} lf</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">Total Downspouts</td>
                      <td className="text-end">{fmt(quoteResult.pricing.totalDownspouts)} lf</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">Material Cost</td>
                      <td className="text-end">${fmt(quoteResult.pricing.materialCost)}</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">Downspout Cost</td>
                      <td className="text-end">${fmt(quoteResult.pricing.downspoutCost)}</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">Trip Fee</td>
                      <td className="text-end">${fmt(quoteResult.pricing.tripFeePrice)}</td>
                    </tr>
                    {(quoteResult.pricing.derivedEndCaps?.groups || []).map((group) => (
                      <tr key={group.index}>
                        <td className="small text-muted">
                          {`End Caps Group ${group.index} (R${group.index}/L${group.index})`}
                        </td>
                        <td className="text-end">{fmtQty(group.value)} each</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="small text-muted">Total End Caps</td>
                      <td className="text-end">{fmtQty(quoteResult.pricing.totalEndCaps)}</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">End Cap Cost</td>
                      <td className="text-end">${fmt(quoteResult.pricing.endCapCost)}</td>
                    </tr>
                    <tr>
                      <td className="small text-muted">Extras</td>
                      <td className="text-end">${fmt(quoteResult.pricing.extrasPrice)}</td>
                    </tr>
                    <tr className="table-secondary">
                      <td className="fw-bold">Subtotal</td>
                      <td className="text-end fw-bold">${fmt(quoteResult.pricing.subtotal)}</td>
                    </tr>
                    <tr>
                      <td className="text-muted small">
                        Discount ({(quoteResult.pricing.discountPercent * 100).toFixed(2)}%)
                      </td>
                      <td className="text-end text-danger">
                        -${fmt(quoteResult.pricing.discountAmount)}
                      </td>
                    </tr>
                    <tr className="table-success">
                      <td className="fw-bold">Project Total</td>
                      <td className="text-end fw-bold">${fmt(quoteResult.pricing.projectTotal)}</td>
                    </tr>
                    <tr>
                      <td className="text-muted small">
                        Deposit ({fmt(quoteResult.pricing.depositPercentDisplay)}%)
                      </td>
                      <td className="text-end">${fmt(quoteResult.pricing.depositAmount)}</td>
                    </tr>
                    <tr className="table-warning">
                      <td className="fw-bold">Remaining Balance</td>
                      <td className="text-end fw-bold">${fmt(quoteResult.pricing.remainingBalance)}</td>
                    </tr>
                  </tbody>
                </Table>
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
