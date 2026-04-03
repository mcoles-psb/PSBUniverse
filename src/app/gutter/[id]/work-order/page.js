"use client";

import { useState, useEffect, use, useCallback } from "react";
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

export default function WorkOrderPage({ params }) {
  const { id } = use(params);
  const [project, setProject] = useState(null);
  const [workOrder, setWorkOrder] = useState({
    installerName: "",
    installDate: "",
    notes: "",
    gutterSize: "6 inch K-Style",
    materials: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from("gtr_t_projects")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setProject(data.data || data);
      if (data.data?.workOrder) {
        setWorkOrder(data.data.workOrder);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadData]);

  const updateField = (field, value) => {
    setWorkOrder((prev) => ({ ...prev, [field]: value }));
  };

  const saveWorkOrder = async () => {
    setSaving(true);
    const projectData = { ...(project || {}), workOrder };
    const { error } = await supabase
      .from("gtr_t_projects")
      .update({ data: projectData, updated_at: new Date().toISOString() })
      .eq("id", id);

    setMessage(error ? "Error saving: " + error.message : "Work order saved.");
    setSaving(false);
  };

  if (loading) return <Container className="py-4">Loading...</Container>;
  if (!project) return <Container className="py-4">Project not found.</Container>;

  return (
    <Container className="py-4" style={{ maxWidth: 900 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href={`/gutter/${id}`} className="back-link me-3">
          ← Back to Project
        </Link>
        <div>
          <h2 className="mb-0">Work Order</h2>
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

      <Card className="mb-3">
        <Card.Header className="fw-bold">Project Information</Card.Header>
        <Card.Body>
          <Row className="g-2">
            <Col md={6}>
              <p className="small mb-1">
                <strong>Customer:</strong> {project.customer || "--"}
              </p>
              <p className="small mb-1">
                <strong>Project:</strong> {project.projectName || "--"}
              </p>
            </Col>
            <Col md={6}>
              <p className="small mb-1">
                <strong>Address:</strong> {project.projectAddress || "--"}
              </p>
              <p className="small mb-1">
                <strong>Date:</strong> {project.date || "--"}
              </p>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header className="fw-bold">Installation Details</Card.Header>
        <Card.Body>
          <Row className="g-2">
            <Col md={6}>
              <Form.Group>
                <Form.Label className="small">Installer Name</Form.Label>
                <Form.Control
                  size="sm"
                  value={workOrder.installerName}
                  onChange={(e) => updateField("installerName", e.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="small">Install Date</Form.Label>
                <Form.Control
                  size="sm"
                  type="date"
                  value={workOrder.installDate}
                  onChange={(e) => updateField("installDate", e.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="small">Gutter Size</Form.Label>
                <Form.Control
                  size="sm"
                  value={workOrder.gutterSize}
                  onChange={(e) => updateField("gutterSize", e.target.value)}
                />
              </Form.Group>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header className="fw-bold">Gutter Sections</Card.Header>
        <Card.Body>
          {(project.sections || []).length === 0 ? (
            <p className="text-muted">No sections defined in the project.</p>
          ) : (
            <Table size="sm" bordered>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Color</th>
                  <th>Sides</th>
                  <th>Length (lf)</th>
                  <th>Height (ft)</th>
                  <th>DS Qty</th>
                </tr>
              </thead>
              <tbody>
                {(project.sections || []).map((s, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{s.color || "--"}</td>
                    <td>{s.sides || "--"}</td>
                    <td>{s.length || "--"}</td>
                    <td>{s.height || "--"}</td>
                    <td>{s.downspoutQty || "--"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header className="fw-bold">Notes</Card.Header>
        <Card.Body>
          <Form.Control
            as="textarea"
            rows={4}
            value={workOrder.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            placeholder="Installation notes, special instructions..."
          />
        </Card.Body>
      </Card>

      <div className="d-flex gap-2 mb-4">
        <Button variant="success" onClick={saveWorkOrder} disabled={saving}>
          {saving ? "Saving..." : "Save Work Order"}
        </Button>
        <Button variant="outline-secondary" onClick={() => window.print()}>
          Print Work Order
        </Button>
      </div>
    </Container>
  );
}
