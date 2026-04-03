"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
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
import { supabase } from "@/lib/supabase";
import { calculateQuote } from "@/lib/pricingEngine";

const emptySection = () => ({
  color: "",
  sides: "",
  length: "",
  height: "",
  downspoutQty: "",
});
const emptyDownspoutSection = () => ({
  downspoutUnitPrice: "",
  downspoutPipeLength: "",
  hangerRate: "",
  endCapUnitPrice: "",
  rightEndCaps1: "",
  rightEndCaps2: "",
  leftEndCaps1: "",
  leftEndCaps2: "",
});
const emptyExtra = () => ({ description: "", qty: "", unitPrice: "" });

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function aggregateDownspoutSections(project) {
  const sections =
    Array.isArray(project?.downspoutSections) && project.downspoutSections.length > 0
      ? project.downspoutSections
      : [
          {
            downspoutUnitPrice: project?.downspoutUnitPrice ?? "",
            downspoutPipeLength: project?.downspoutPipeLength ?? "",
            hangerRate: project?.hangerRate ?? "",
            endCapUnitPrice: project?.endCapUnitPrice ?? "",
            rightEndCaps1: project?.rightEndCaps1 ?? "",
            rightEndCaps2: project?.rightEndCaps2 ?? "",
            leftEndCaps1: project?.leftEndCaps1 ?? "",
            leftEndCaps2: project?.leftEndCaps2 ?? "",
          },
        ];

  const primary = sections[0] ?? emptyDownspoutSection();

  return {
    downspoutUnitPrice: primary.downspoutUnitPrice,
    downspoutPipeLength: primary.downspoutPipeLength,
    hangerRate: primary.hangerRate,
    endCapUnitPrice: primary.endCapUnitPrice,
    rightEndCaps1: String(sections.reduce((sum, row) => sum + asNumber(row.rightEndCaps1), 0)),
    rightEndCaps2: String(sections.reduce((sum, row) => sum + asNumber(row.rightEndCaps2), 0)),
    leftEndCaps1: String(sections.reduce((sum, row) => sum + asNumber(row.leftEndCaps1), 0)),
    leftEndCaps2: String(sections.reduce((sum, row) => sum + asNumber(row.leftEndCaps2), 0)),
  };
}

export default function GutterProjectEditPage({ params }) {
  const { id } = use(params);
  const router = useRouter();

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

  const loadAll = useCallback(async () => {
    const [statusRes, colorRes, mfgRes, lgRes, tfRes, discRes, projRes] =
      await Promise.all([
        supabase.from("gtr_s_statuses").select("*").order("id"),
        supabase.from("gtr_s_colors").select("*").order("id"),
        supabase.from("gtr_s_manufacturers").select("*").order("id"),
        supabase.from("gtr_s_leaf_guards").select("*").order("id"),
        supabase.from("gtr_s_trip_fee_rates").select("*").order("id"),
        supabase.from("gtr_s_discounts").select("*").order("id"),
        supabase.from("gtr_t_projects").select("*").eq("id", id).single(),
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
      materialManufacturer: m.map((r) => ({ name: r.name, rate: r.rate })),
      leafGuard: lg.map((r) => ({ name: r.name, price: r.price })),
      tripFeeRates: tf.map((r) => ({ trip: r.trip, rate: r.rate })),
    });

    if (projRes.data?.data) {
      const loaded = projRes.data.data;
      const hasDownspoutSections =
        Array.isArray(loaded.downspoutSections) && loaded.downspoutSections.length > 0;

      setProject({
        ...loaded,
        downspoutSections: hasDownspoutSections
          ? loaded.downspoutSections
          : [
              {
                downspoutUnitPrice: loaded.downspoutUnitPrice ?? "",
                downspoutPipeLength: loaded.downspoutPipeLength ?? "",
                hangerRate: loaded.hangerRate ?? "",
                endCapUnitPrice: loaded.endCapUnitPrice ?? "",
                rightEndCaps1: loaded.rightEndCaps1 ?? "",
                rightEndCaps2: loaded.rightEndCaps2 ?? "",
                leftEndCaps1: loaded.leftEndCaps1 ?? "",
                leftEndCaps2: loaded.leftEndCaps2 ?? "",
              },
            ],
      });
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

  const updateSection = (index, field, value) => {
    setProject((prev) => {
      const sections = [...(prev.sections || [])];
      sections[index] = { ...sections[index], [field]: value };
      return { ...prev, sections };
    });
  };

  const addSection = () => {
    if ((project.sections || []).length >= 4) return;
    setProject((prev) => ({
      ...prev,
      sections: [...(prev.sections || []), emptySection()],
    }));
  };

  const removeSection = (index) => {
    setProject((prev) => ({
      ...prev,
      sections: (prev.sections || []).filter((_, i) => i !== index),
    }));
  };

  const updateDownspoutSection = (index, field, value) => {
    setProject((prev) => {
      const downspoutSections = [...(prev.downspoutSections || [emptyDownspoutSection()])];
      downspoutSections[index] = { ...downspoutSections[index], [field]: value };
      return { ...prev, downspoutSections };
    });
  };

  const addDownspoutSection = () => {
    setProject((prev) => {
      const downspoutSections = [...(prev.downspoutSections || [emptyDownspoutSection()])];
      if (downspoutSections.length >= 4) return prev;
      return {
        ...prev,
        downspoutSections: [...downspoutSections, emptyDownspoutSection()],
      };
    });
  };

  const removeDownspoutSection = (index) => {
    setProject((prev) => {
      const downspoutSections = (prev.downspoutSections || [emptyDownspoutSection()]).filter(
        (_, i) => i !== index
      );
      return {
        ...prev,
        downspoutSections: downspoutSections.length > 0 ? downspoutSections : [emptyDownspoutSection()],
      };
    });
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
    const normalizedProject = {
      ...project,
      ...aggregateDownspoutSections(project),
    };
    return calculateQuote(normalizedProject, setup);
  }, [project, setup]);

  const saveProject = async () => {
    setSaving(true);
    setMessage("");
    const now = new Date().toISOString();
    const normalizedProject = {
      ...project,
      ...aggregateDownspoutSections(project),
    };
    const { error } = await supabase
      .from("gtr_t_projects")
      .update({
        project_name: normalizedProject.projectName,
        customer: normalizedProject.customer,
        status: normalizedProject.status || "In Progress",
        date: normalizedProject.date,
        request_link: normalizedProject.requestLink,
        project_address: normalizedProject.projectAddress,
        data: normalizedProject,
        updated_at: now,
      })
      .eq("id", id);

    if (error) {
      setMessage("Error saving: " + error.message);
    } else {
      setMessage("Project saved.");
    }
    setSaving(false);
  };

  const fmt = (n) =>
    typeof n === "number"
      ? n.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "--";

  if (loading) return <Container className="py-4">Loading...</Container>;
  if (!project) return <Container className="py-4">Project not found.</Container>;

  return (
    <Container className="py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/gutter" className="back-link me-3">
          ← Back
        </Link>
        <div>
          <h2 className="mb-0">Edit Gutter Project</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
            {project.projectName || project.projectId}
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
                    <Form.Control size="sm" value={project.projectId} readOnly />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small">Status</Form.Label>
                    <Form.Select
                      size="sm"
                      value={project.status || ""}
                      onChange={(e) => updateField("status", e.target.value)}
                    >
                      <option value="">Select status...</option>
                      {statuses.map((s) => (
                        <option key={s.id} value={s.name}>
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
                    value={project.manufacturer || ""}
                    onChange={(e) => updateField("manufacturer", e.target.value)}
                  >
                    <option value="">Select manufacturer...</option>
                    {manufacturers.map((m) => (
                      <option key={m.id} value={m.name}>
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
                    value={project.tripFeeKey || ""}
                    onChange={(e) => updateField("tripFeeKey", e.target.value)}
                  >
                    <option value="">Select trip fee...</option>
                    {tripFeeRates.map((t) => (
                      <option key={t.id} value={t.trip}>
                        {t.trip} (${t.rate})
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
                Gutter Sections ({(project.sections || []).length}/4)
              </span>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={addSection}
                disabled={(project.sections || []).length >= 4}
              >
                + Add Section
              </Button>
            </Card.Header>
            <Card.Body>
              {(project.sections || []).map((section, i) => (
                <div key={i} className="border rounded p-2 mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong className="small">Section #{i + 1}</strong>
                    {(project.sections || []).length > 1 && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeSection(i)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <Row className="g-2">
                    <Col md={3}>
                      <Form.Select
                        size="sm"
                        value={section.color || ""}
                        onChange={(e) => updateSection(i, "color", e.target.value)}
                      >
                        <option value="">Color...</option>
                        {colors.map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        placeholder="Sides"
                        value={section.sides || ""}
                        onChange={(e) => updateSection(i, "sides", e.target.value)}
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
                        placeholder="DS Qty"
                        value={section.downspoutQty || ""}
                        onChange={(e) =>
                          updateSection(i, "downspoutQty", e.target.value)
                        }
                      />
                    </Col>
                  </Row>
                </div>
              ))}
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Header className="d-flex justify-content-between align-items-center">
              <span className="fw-bold">
                Downspout Sections ({(project.downspoutSections || []).length}/4)
              </span>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={addDownspoutSection}
                disabled={(project.downspoutSections || []).length >= 4}
              >
                + Add Section
              </Button>
            </Card.Header>
            <Card.Body>
              {(project.downspoutSections || []).map((downspoutSection, i) => (
                <div key={i} className="border rounded p-2 mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong className="small">Section #{i + 1}</strong>
                    {(project.downspoutSections || []).length > 1 && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeDownspoutSection(i)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>

                  <Row className="g-2">
                    <Col md={4}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="Downspout Unit Price"
                        value={downspoutSection.downspoutUnitPrice || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "downspoutUnitPrice", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="DS Pipe Length"
                        value={downspoutSection.downspoutPipeLength || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "downspoutPipeLength", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="Hanger Rate"
                        value={downspoutSection.hangerRate || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "hangerRate", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Control
                        size="sm"
                        type="number"
                        step="0.01"
                        placeholder="End Cap Unit Price"
                        value={downspoutSection.endCapUnitPrice || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "endCapUnitPrice", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        placeholder="R End Caps 1"
                        value={downspoutSection.rightEndCaps1 || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "rightEndCaps1", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        placeholder="R End Caps 2"
                        value={downspoutSection.rightEndCaps2 || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "rightEndCaps2", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        placeholder="L End Caps 1"
                        value={downspoutSection.leftEndCaps1 || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "leftEndCaps1", e.target.value)
                        }
                      />
                    </Col>
                    <Col md={2}>
                      <Form.Control
                        size="sm"
                        type="number"
                        placeholder="L End Caps 2"
                        value={downspoutSection.leftEndCaps2 || ""}
                        onChange={(e) =>
                          updateDownspoutSection(i, "leftEndCaps2", e.target.value)
                        }
                      />
                    </Col>
                  </Row>
                </div>
              ))}
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
                    <tr>
                      <td className="small text-muted">Extras</td>
                      <td className="text-end">${fmt(quoteResult.pricing.extrasPrice)}</td>
                    </tr>
                    <tr className="table-secondary">
                      <td className="fw-bold">Subtotal</td>
                      <td className="text-end fw-bold">${fmt(quoteResult.pricing.subtotal)}</td>
                    </tr>
                    {project.discountIncluded && (
                      <tr className="table-success">
                        <td className="fw-bold">Final</td>
                        <td className="text-end fw-bold">${fmt(quoteResult.pricing.discountedTotal)}</td>
                      </tr>
                    )}
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
