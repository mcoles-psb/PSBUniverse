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
  statuses: createCacheKey("setup", "statuses"),
  colors: createCacheKey("setup", "colors"),
  manufacturers: createCacheKey("setup", "manufacturers"),
  projectsList: createCacheKey("projects", "list"),
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
  invalidateKeys,
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
    const keysToInvalidate = [cacheKey, ...(invalidateKeys || [])].filter(
      Boolean
    );
    if (keysToInvalidate.length > 0) {
      invalidateCacheKeys(keysToInvalidate, { namespace: cacheNamespace });
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
                  {!editing.has(i) ? (
                    <Button
                      variant="outline-primary"
                      size="sm"
                      className="me-1"
                      onClick={() => startEdit(i)}
                    >
                      Edit
                    </Button>
                  ) : null}
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

export default function GlobalSetupPage() {
  const [statuses, setStatuses] = useState([]);
  const [colors, setColors] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);

  const loadAll = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);

    try {
      const [s, c, m] = await Promise.all([
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.statuses,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_statuses",
            select: "*",
            orderBy: "status_id",
          },
        }),
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.colors,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_colors",
            select: "*",
            orderBy: "color_id",
          },
        }),
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.manufacturers,
          namespace: CACHE_NAMESPACE,
          forceFresh,
          query: {
            table: "core_s_manufacturers",
            select: "*",
            orderBy: "manufacturer_id",
          },
        }),
      ]);

      setStatuses(s.data || []);
      setColors(c.data || []);
      setManufacturers(m.data || []);
    } catch (error) {
      console.error("Failed to load global setup data", error);
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
          <h2 className="mb-0">Global Setup Tables</h2>
          <p className="text-muted mb-0">
            Shared setup data for Gutter and OHD modules
          </p>
        </div>
      </div>

      <Accordion defaultActiveKey="statuses">
        <SetupTable
          title="Status List"
          tableName="core_s_statuses"
          pkColumn="status_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.statuses}
          invalidateKeys={[CACHE_KEYS.projectsList]}
          columns={[
            { key: "name", label: "Status", type: "text" },
            { key: "description", label: "Description", type: "text" },
          ]}
          data={statuses}
          onSave={loadAll}
        />
        <SetupTable
          title="Color Names"
          tableName="core_s_colors"
          pkColumn="color_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.colors}
          columns={[{ key: "name", label: "Color Name", type: "text" }]}
          data={colors}
          onSave={loadAll}
        />
        <SetupTable
          title="Manufacturers"
          tableName="core_s_manufacturers"
          pkColumn="manufacturer_id"
          cacheNamespace={CACHE_NAMESPACE}
          cacheKey={CACHE_KEYS.manufacturers}
          columns={[
            { key: "name", label: "Manufacturer Name", type: "text" },
            { key: "rate", label: "Rate", type: "number" },
          ]}
          data={manufacturers}
          onSave={loadAll}
        />
      </Accordion>
    </Container>
  );
}


