"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Container,
  Accordion,
  Table,
  Button,
  Form,
} from "react-bootstrap";
import { supabase } from "@/infrastructure/supabase/client";
import { createCacheKey, invalidateCacheKeys } from "@/core/cache";
import { getSupabaseSelectWithCache } from "@/core/cache";
import { toastError, toastSuccess } from "@/shared/utils/toast";

const CACHE_NAMESPACE = "psb-universe";
const CACHE_KEYS = {
  leafGuards: createCacheKey("setup", "leafGuards"),
  discounts: createCacheKey("setup", "discounts"),
  tripRates: createCacheKey("setup", "tripRates"),
};

function SetupTable({
  title,
  tableName,
  pkColumn,
  columns,
  data,
  onSave,
  cacheNamespace,
  cacheKey,
}) {
  const [editing, setEditing] = useState(new Set());
  const [draft, setDraft] = useState([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDraft(data.map((r) => ({ ...r })));
      setDirty(false);
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
  };

  const save = async () => {
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
      .gt(pkColumn, 0);
    if (delError) {
      toastError("Error: " + delError.message, title);
      return;
    }

    if (rows.length > 0) {
      const { error: insError } = await supabase
        .from(tableName)
        .insert(rows);
      if (insError) {
        toastError("Error: " + insError.message, title);
        return;
      }
    }

    setEditing(new Set());
    setDirty(false);
    toastSuccess("Saved!", title);
    if (cacheKey) {
      invalidateCacheKeys([cacheKey], { namespace: cacheNamespace });
    }
    if (onSave) onSave({ forceFresh: true });
  };

  return (
    <Accordion.Item eventKey={tableName}>
      <Accordion.Header>{title}</Accordion.Header>
      <Accordion.Body>
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
                    Ã—
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

  const loadAll = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);

    try {
      const [lg, d, tf] = await Promise.all([
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.leafGuards,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_leaf_guards",
            select: "*",
            orderBy: "leaf_guard_id",
          },
        }),
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.discounts,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_discounts",
            select: "*",
            orderBy: "discount_id",
          },
        }),
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.tripRates,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_trip_rates",
            select: "*",
            orderBy: "trip_id",
          },
        }),
      ]);
      setLeafGuards(lg.data || []);
      setDiscounts(d.data || []);
      setTripFeeRates(tf.data || []);
    } catch (error) {
      console.error("Failed to load gutter setup data", error);
    }
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
          <i className="bi bi-arrow-left" aria-hidden="true" /> Back
        </Link>
        <div>
          <h2 className="mb-0">Gutter Setup Tables</h2>
          <p className="text-muted mb-0">
            Gutter-specific setup data (shared tables in Global Setup)
          </p>
        </div>
      </div>

      <Accordion defaultActiveKey="leaf_guards">
        <SetupTable
          title="Leaf Guard"
          tableName="core_s_leaf_guards"
          pkColumn="leaf_guard_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.leafGuards}
          columns={[
            { key: "name", label: "Name", type: "text" },
            { key: "price", label: "Price", type: "number" },
          ]}
          data={leafGuards}
          onSave={loadAll}
        />
        <SetupTable
          title="Discounts"
          tableName="core_s_discounts"
          pkColumn="discount_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.discounts}
          columns={[
            { key: "percentage", label: "Percent", type: "number" },
            { key: "description", label: "Description", type: "text" },
          ]}
          data={discounts}
          onSave={loadAll}
        />
        <SetupTable
          title="Trip Fee Rates"
          tableName="core_s_trip_rates"
          pkColumn="trip_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.tripRates}
          columns={[
            { key: "label", label: "Trip", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
          ]}
          data={tripFeeRates}
          onSave={loadAll}
        />
      </Accordion>
    </Container>
  );
}


