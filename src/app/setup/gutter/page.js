"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Container,
  Accordion,
  Table,
  Button,
  Form,
  Alert,
} from "react-bootstrap";
import { supabase } from "@/lib/supabase";

function SetupTable({ title, tableName, columns, data, onSave }) {
  const [editing, setEditing] = useState(new Set());
  const [draft, setDraft] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDraft(data.map((r) => ({ ...r })));
      setDirty(false);
      setMsg("");
    }, 0);

    return () => clearTimeout(timer);
  }, [data]);

  const startEdit = (i) => {
    setEditing((prev) => new Set(prev).add(i));
  };

  const updateDraft = (i, col, value) => {
    setDraft((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [col]: value };
      return next;
    });
    setDirty(true);
  };

  const addRow = () => {
    const newRow = {};
    columns.forEach((c) => {
      newRow[c.key] = "";
    });
    setDraft((prev) => [...prev, newRow]);
    setEditing((prev) => new Set(prev).add(draft.length));
    setDirty(true);
  };

  const removeRow = (i) => {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
    setEditing((prev) => {
      const next = new Set();
      prev.forEach((v) => {
        if (v < i) next.add(v);
        else if (v > i) next.add(v - 1);
      });
      return next;
    });
    setDirty(true);
  };

  const cancel = () => {
    setDraft(data.map((r) => ({ ...r })));
    setEditing(new Set());
    setDirty(false);
    setMsg("");
  };

  const save = async () => {
    setMsg("");
    const rows = draft
      .filter((r) => columns.some((c) => String(r[c.key] || "").trim() !== ""))
      .map((r) => {
        const cleaned = {};
        columns.forEach((c) => {
          cleaned[c.key] =
            c.type === "number" ? parseFloat(r[c.key]) || 0 : r[c.key];
        });
        return cleaned;
      });

    const { error: delError } = await supabase
      .from(tableName)
      .delete()
      .gte("id", 0);
    if (delError) {
      setMsg("Error: " + delError.message);
      return;
    }

    if (rows.length > 0) {
      const { error: insError } = await supabase
        .from(tableName)
        .insert(rows);
      if (insError) {
        setMsg("Error: " + insError.message);
        return;
      }
    }

    setEditing(new Set());
    setDirty(false);
    setMsg("Saved!");
    if (onSave) onSave();
  };

  return (
    <Accordion.Item eventKey={tableName}>
      <Accordion.Header>{title}</Accordion.Header>
      <Accordion.Body>
        {msg && (
          <Alert
            variant={msg.includes("Error") ? "danger" : "success"}
            className="py-1 px-2 small"
            dismissible
            onClose={() => setMsg("")}
          >
            {msg}
          </Alert>
        )}
        <Table size="sm" bordered className="setup-table mb-2">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    {editing.has(i) ? (
                      <Form.Control
                        size="sm"
                        type={c.type === "number" ? "number" : "text"}
                        step={c.type === "number" ? "0.01" : undefined}
                        value={row[c.key] ?? ""}
                        onChange={(e) => updateDraft(i, c.key, e.target.value)}
                      />
                    ) : (
                      <span
                        className="small"
                        style={{ cursor: "pointer" }}
                        onClick={() => startEdit(i)}
                      >
                        {row[c.key] ?? ""}
                      </span>
                    )}
                  </td>
                ))}
                <td>
                  {!editing.has(i) && (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="me-1"
                      onClick={() => startEdit(i)}
                    >
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => removeRow(i)}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="d-flex gap-2 align-items-center">
          <span className="small text-muted me-auto">
            {dirty ? "Unsaved changes" : "No changes"}
          </span>
          <Button variant="outline-success" size="sm" onClick={save}>
            Save
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="outline-primary" size="sm" onClick={addRow}>
            Add Row
          </Button>
        </div>
      </Accordion.Body>
    </Accordion.Item>
  );
}

export default function GutterSetupPage() {
  const [leafGuards, setLeafGuards] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [tripFeeRates, setTripFeeRates] = useState([]);

  const loadAll = useCallback(async () => {
    const [lg, d, tf] = await Promise.all([
      supabase.from("gtr_s_leaf_guards").select("*").order("id"),
      supabase.from("gtr_s_discounts").select("*").order("id"),
      supabase.from("gtr_s_trip_fee_rates").select("*").order("id"),
    ]);
    setLeafGuards(lg.data || []);
    setDiscounts(d.data || []);
    setTripFeeRates(tf.data || []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadAll]);

  return (
    <Container className="py-4" style={{ maxWidth: 900 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          ← Back
        </Link>
        <div>
          <h2 className="mb-0">Gutter Setup Tables</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
            Gutter-specific setup data (shared tables in Global Setup)
          </p>
        </div>
      </div>

      <Accordion defaultActiveKey="leaf_guards">
        <SetupTable
          title="Leaf Guard"
          tableName="gtr_s_leaf_guards"
          columns={[
            { key: "name", label: "Name", type: "text" },
            { key: "price", label: "Price", type: "number" },
          ]}
          data={leafGuards}
          onSave={loadAll}
        />
        <SetupTable
          title="Discounts"
          tableName="gtr_s_discounts"
          columns={[
            { key: "percent", label: "Percent", type: "number" },
            { key: "description", label: "Description", type: "text" },
          ]}
          data={discounts}
          onSave={loadAll}
        />
        <SetupTable
          title="Trip Fee Rates"
          tableName="gtr_s_trip_fee_rates"
          columns={[
            { key: "trip", label: "Trip", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
          ]}
          data={tripFeeRates}
          onSave={loadAll}
        />
      </Accordion>
    </Container>
  );
}
