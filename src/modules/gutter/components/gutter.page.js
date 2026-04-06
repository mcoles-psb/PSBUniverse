"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Container,
  Button,
  ListGroup,
  Dropdown,
  Badge,
} from "react-bootstrap";
import { supabase } from "@/infrastructure/supabase/client";
import {
  createCacheKey,
  invalidateCacheKeys,
  DEFAULT_CACHE_TTL_MS,
} from "@/core/cache";
import { getSupabaseSelectWithCache } from "@/core/cache";

const CACHE_NAMESPACE = "psb-universe";
const PROJECTS_LIST_TTL_MS = 5 * 60 * 1000;
const CACHE_KEYS = {
  projectList: createCacheKey("projects", "list"),
  statuses: createCacheKey("setup", "statuses"),
  projectDetail: (projId) => createCacheKey("projects", "detail", projId),
  projectSides: (projId) => createCacheKey("projects", "sides", projId),
  projectExtras: (projId) => createCacheKey("projects", "extras", projId),
};

export default function GutterCalculatorPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async (options = {}) => {
    const forceFresh = Boolean(options.forceFresh);
    setLoading(true);

    try {
      const [projectRes, statusRes] = await Promise.all([
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.projectList,
          namespace: CACHE_NAMESPACE,
          ttlMs: PROJECTS_LIST_TTL_MS,
          forceFresh,
          query: {
            table: "gtr_t_projects",
            select: "proj_id, project_name, customer, status_id, updated_at, gtr_s_statuses(name)",
            orderBy: "updated_at",
            ascending: false,
          },
        }),
        getSupabaseSelectWithCache({
          cacheKey: CACHE_KEYS.statuses,
          namespace: CACHE_NAMESPACE,
          ttlMs: DEFAULT_CACHE_TTL_MS,
          forceFresh,
          query: {
            table: "gtr_s_statuses",
            select: "status_id, name",
            orderBy: "status_id",
          },
        }),
      ]);

      setStatuses(statusRes.data || []);
      setProjects(projectRes.data || []);
    } catch (error) {
      console.error("Failed to load gutter projects", error);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadProjects]);

  const statusLabelById = useCallback(
    (statusId) => {
      if (!statusId) return "In Progress";
      const fromSetup = statuses.find((s) => s.status_id === statusId || String(s.status_id) === String(statusId));
      return fromSetup?.name || "In Progress";
    },
    [statuses]
  );

  const updateStatus = async (projId, statusName) => {
    const target = statuses.find((s) => s.name === statusName);
    if (!target?.status_id) return;

    const { error } = await supabase
      .from("gtr_t_projects")
      .update({ status_id: target.status_id })
      .eq("proj_id", projId);

    if (error) {
      console.error("Failed to update project status", error);
      return;
    }

    invalidateCacheKeys(
      [
        CACHE_KEYS.projectList,
        CACHE_KEYS.projectDetail(projId),
        CACHE_KEYS.projectSides(projId),
        CACHE_KEYS.projectExtras(projId),
      ],
      { namespace: CACHE_NAMESPACE }
    );

    await loadProjects({ forceFresh: true });
  };

  const deleteProject = async (projId) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const { error } = await supabase
      .from("gtr_t_projects")
      .delete()
      .eq("proj_id", projId);

    if (error) {
      console.error("Failed to delete project", error);
      return;
    }

    invalidateCacheKeys(
      [
        CACHE_KEYS.projectList,
        CACHE_KEYS.projectDetail(projId),
        CACHE_KEYS.projectSides(projId),
        CACHE_KEYS.projectExtras(projId),
      ],
      { namespace: CACHE_NAMESPACE }
    );

    await loadProjects({ forceFresh: true });
  };

  const formatDate = (iso) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleString();
  };

  return (
    <Container className="py-4" style={{ maxWidth: 1000 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          â† Back
        </Link>
        <div>
          <h2 className="mb-0">Gutter Quote Calculator</h2>
          <p className="text-muted mb-0" style={{ fontSize: "0.85rem" }}>
            Project list and status workspace
          </p>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3">
        <Link href="/gutter/new" className="btn btn-primary btn-sm">
          + New Project
        </Link>
      </div>

      {loading ? (
        <p className="text-muted">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <p className="fw-bold">No projects yet</p>
          <p>
            Create your first project using the <strong>New Project</strong>{" "}
            button above.
          </p>
        </div>
      ) : (
        <ListGroup>
          {projects.map((project) => (
            <ListGroup.Item
              key={project.proj_id}
              className="d-flex justify-content-between align-items-center"
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/gutter/${project.proj_id}`)}
            >
              <div>
                <p className="fw-bold mb-0">
                  {project.project_name || "(Untitled project)"}
                </p>
                <p className="text-muted mb-0" style={{ fontSize: "0.84rem" }}>
                  ID: {project.proj_id || "--"} |{" "}
                  <Badge bg="secondary" className="me-1">
                    {(Array.isArray(project.gtr_s_statuses)
                      ? project.gtr_s_statuses[0]?.name
                      : project.gtr_s_statuses?.name) || statusLabelById(project.status_id)}
                  </Badge>{" "}
                  | Last updated: {formatDate(project.updated_at)}
                </p>
              </div>
              <Dropdown onClick={(e) => e.stopPropagation()}>
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  â‹®
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item
                    onClick={() => updateStatus(project.proj_id, "Completed")}
                  >
                    Mark as Complete
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => updateStatus(project.proj_id, "Cancelled")}
                  >
                    Mark as Cancelled
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() =>
                      router.push(`/gutter/${project.proj_id}/work-order`)
                    }
                  >
                    Work Order
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    className="text-danger"
                    onClick={() => deleteProject(project.proj_id)}
                  >
                    Delete
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </Container>
  );
}

