"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Container,
} from "react-bootstrap";
import {
  createCacheKey,
  invalidateCacheKeys,
} from "@/core/cache";
import { startNavbarLoader } from "@/shared/utils/navbar-loader";

const CACHE_NAMESPACE = "psb-universe";
const CACHE_KEYS = {
  projectList: createCacheKey("projects", "list"),
  statuses: createCacheKey("setup", "statuses"),
  projectDetail: (projId) => createCacheKey("projects", "detail", projId),
  projectSides: (projId) => createCacheKey("projects", "sides", projId),
  projectExtras: (projId) => createCacheKey("projects", "extras", projId),
};

const ROW_MENU_WIDTH = 260;
const ROW_MENU_HEIGHT = 320;

const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

const toPercentLabel = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "--";
  const percent = numeric > 1 ? numeric : numeric * 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${rounded}%`;
};

const formatCurrency = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
};

const statusToneClass = (statusName) => {
  const status = normalizeText(statusName);
  if (status.includes("await")) return "gutter-status-awaiting";
  if (status.includes("complete")) return "gutter-status-complete";
  if (status.includes("cancel")) return "gutter-status-cancelled";
  if (status.includes("draft")) return "gutter-status-draft";
  return "gutter-status-default";
};

const readProjectTotal = (project) => {
  const total = Number(project?.total_project_price ?? project?.project_total_price);
  return Number.isFinite(total) ? total : null;
};

export default function GutterCalculatorPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rowMenu, setRowMenu] = useState(null);

  const resolveRelated = useCallback((value) => {
    if (Array.isArray(value)) return value[0] || null;
    return value && typeof value === "object" ? value : null;
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/gutter/projects", {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "Unable to load projects");
      }

      setStatuses(Array.isArray(payload?.statuses) ? payload.statuses : []);
      setProjects(Array.isArray(payload?.projects) ? payload.projects : []);
    } catch (error) {
      console.error("Failed to load gutter projects", error);
      setStatuses([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeRowMenu = useCallback(() => {
    setRowMenu(null);
  }, []);

  const openRowMenu = useCallback((event, projId) => {
    if (!projId) return;

    const clickedX = Number(event.clientX);
    const clickedY = Number(event.clientY);
    let nextX = Math.min(
      window.innerWidth - ROW_MENU_WIDTH - 12,
      Math.max(12, clickedX + 8)
    );
    let nextY = Math.min(
      window.innerHeight - ROW_MENU_HEIGHT - 10,
      Math.max(10, clickedY + 8)
    );

    if (nextY + ROW_MENU_HEIGHT > window.innerHeight - 10) {
      nextY = Math.max(10, clickedY - ROW_MENU_HEIGHT - 6);
    }

    if (nextX + ROW_MENU_WIDTH > window.innerWidth - 10) {
      nextX = Math.max(12, clickedX - ROW_MENU_WIDTH - 8);
    }

    setRowMenu((prev) =>
      prev?.projId === projId
        ? null
        : {
            projId,
            x: nextX,
            y: nextY,
          }
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadProjects]);

  useEffect(() => {
    if (!rowMenu) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".gutter-row-menu")) return;
      closeRowMenu();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeRowMenu();
      }
    };

    const handleScrollOrResize = () => {
      closeRowMenu();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [rowMenu, closeRowMenu]);

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

    const response = await fetch("/api/gutter/projects", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        projId,
        statusId: target.status_id,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Failed to update project status", payload?.error || payload?.message || payload);
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

    await loadProjects();
  };

  const deleteProject = async (projId) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;

    const response = await fetch(`/api/gutter/projects?projId=${encodeURIComponent(projId)}`, {
      method: "DELETE",
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Failed to delete project", payload?.error || payload?.message || payload);
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

    await loadProjects();
  };

  const openProject = useCallback(
    (projId) => {
      if (!projId) return;
      closeRowMenu();
      startNavbarLoader();
      router.push(`/gutter/${projId}`);
    },
    [closeRowMenu, router]
  );

  const openWorkOrder = useCallback(
    (projId) => {
      if (!projId) return;
      closeRowMenu();
      startNavbarLoader();
      router.push(`/gutter/${projId}/work-order`);
    },
    [closeRowMenu, router]
  );

  const setProjectStatus = useCallback(
    async (projId, statusName) => {
      closeRowMenu();
      await updateStatus(projId, statusName);
    },
    [closeRowMenu, updateStatus]
  );

  const deleteProjectFromMenu = useCallback(
    async (projId) => {
      closeRowMenu();
      await deleteProject(projId);
    },
    [closeRowMenu, deleteProject]
  );

  const formatDate = (iso) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleString();
  };

  const formatProjectDate = (dateValue) => {
    if (!dateValue) return "--";
    return new Date(dateValue).toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const getStatusName = useCallback(
    (project) => resolveRelated(project.core_s_statuses)?.name || statusLabelById(project.status_id),
    [resolveRelated, statusLabelById]
  );

  const getManufacturerName = useCallback(
    (project) => resolveRelated(project.core_s_manufacturers)?.name || "--",
    [resolveRelated]
  );

  const getTripLabel = useCallback(
    (project) => resolveRelated(project.core_s_trip_rates)?.label || "--",
    [resolveRelated]
  );

  const statusOptions = useMemo(() => {
    const set = new Set();

    (statuses || []).forEach((status) => {
      const name = String(status?.name || "").trim();
      if (name) set.add(name);
    });

    (projects || []).forEach((project) => {
      const name = String(getStatusName(project) || "").trim();
      if (name) set.add(name);
    });

    return Array.from(set);
  }, [statuses, projects, getStatusName]);

  const filteredProjects = useMemo(() => {
    const query = normalizeText(searchTerm);
    const statusNeedle = normalizeText(statusFilter);

    return (projects || []).filter((project) => {
      const statusName = getStatusName(project);
      const manufacturerName = getManufacturerName(project);
      const tripLabel = getTripLabel(project);

      if (statusNeedle !== "all" && normalizeText(statusName) !== statusNeedle) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        project.project_name,
        project.customer,
        project.project_address,
        project.proj_id,
        project.created_by_name,
        project.updated_by_name,
        statusName,
        manufacturerName,
        tripLabel,
        project.total_project_price,
      ]
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    projects,
    searchTerm,
    statusFilter,
    getStatusName,
    getManufacturerName,
    getTripLabel,
  ]);

  const stats = useMemo(() => {
    const totalProjectValue = projects.reduce((sum, project) => {
      const statusName = getStatusName(project);
      if (!normalizeText(statusName).includes("complete")) {
        return sum;
      }

      const total = readProjectTotal(project);
      return sum + (Number.isFinite(total) ? total : 0);
    }, 0);

    return {
      totalProjectValue,
    };
  }, [projects, getStatusName]);

  const actionStatusOptions = useMemo(() => {
    const normalizedMap = new Map(
      statusOptions.map((statusName) => [normalizeText(statusName), statusName])
    );

    const preferred = [
      "Awaiting Dealer Response",
      "Completed",
      "Cancelled",
    ];

    const ordered = preferred
      .map((statusName) => normalizedMap.get(normalizeText(statusName)))
      .filter(Boolean);

    if (ordered.length > 0) {
      return ordered;
    }

    if (statusOptions.length > 0) {
      return statusOptions.slice(0, 4);
    }

    return ["Completed", "Cancelled"];
  }, [statusOptions]);

  const showingCount = filteredProjects.length;
  const totalCount = projects.length;

  return (
    <Container fluid className="gutter-workspace px-3 px-lg-4 py-4">
      <div className="gutter-workspace-shell mx-auto">
        <div className="gutter-workspace-hero mb-4">
          <div>
            <h2 className="gutter-hero-title mb-1">Saved Projects</h2>
            <p className="gutter-hero-subtitle mb-0">
              Manage gutter quote headers with status, manufacturer, trip logistics, discount, and deposit visibility.
            </p>
          </div>

          <div className="gutter-hero-actions">
            <button type="button" className="btn btn-light btn-sm gutter-secondary-action" disabled>
              Advanced Filter
            </button>
            <Link href="/gutter/new" className="btn btn-primary btn-sm gutter-primary-action">
              Create Project
            </Link>
          </div>
        </div>

        <div className="gutter-stats-grid mb-4">
          <div className="gutter-stat-card gutter-stat-total-price">
            <p className="gutter-stat-kicker mb-1">Total Price Of Completed Projects</p>
            <p className="gutter-stat-value mb-0">{formatCurrency(stats.totalProjectValue)}</p>
          </div>
        </div>

        <div className="gutter-toolbar mb-3">
          <div className="gutter-search-box">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by project, customer, address, status, manufacturer..."
              className="form-control form-control-sm gutter-search-input"
            />
          </div>

          <select
            className="form-select form-select-sm gutter-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All Statuses</option>
            {statusOptions.map((statusName) => (
              <option key={statusName} value={statusName}>
                {statusName}
              </option>
            ))}
          </select>

          <p className="gutter-toolbar-count mb-0">
            Showing {showingCount} of {totalCount}
          </p>
        </div>

        <div className="gutter-table-shell">
          {loading ? (
            <div className="gutter-empty-state py-5">
              <p className="mb-0 text-muted">Loading projects...</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="gutter-empty-state py-5">
              <p className="fw-bold mb-1">No matching projects</p>
              <p className="text-muted mb-0">
                Try a different search or status filter, or create a new project.
              </p>
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table align-middle mb-0 gutter-project-table">
                  <thead>
                    <tr>
                      <th>Project / ID</th>
                      <th>Customer &amp; Location</th>
                      <th>Status</th>
                      <th>Manufacturer</th>
                      <th>Logistics</th>
                      <th className="text-end">Project Total</th>
                      <th>Created by</th>
                      <th>Updated by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map((project) => {
                      const statusName = getStatusName(project);
                      const manufacturerName = getManufacturerName(project);
                      const tripLabel = getTripLabel(project);
                      const depositLabel = toPercentLabel(project.deposit_percent);
                      const projectTotalAmount = readProjectTotal(project);
                      const projectTotalLabel =
                        projectTotalAmount === null ? "--" : formatCurrency(projectTotalAmount);
                      const createdByLabel = project.created_by_name || "--";
                      const updatedByLabel = project.updated_by_name || "--";
                      const createdAtLabel = formatDate(project.created_at);
                      const updatedAtLabel = formatDate(project.updated_at);

                      return (
                        <tr
                          key={project.proj_id}
                          className={`gutter-project-row ${rowMenu?.projId === project.proj_id ? "gutter-project-row-menu-open" : ""}`}
                          onClick={(event) => openRowMenu(event, project.proj_id)}
                        >
                          <td>
                            <p className="gutter-row-title mb-0">
                              {project.project_name || "(Untitled project)"}
                            </p>
                            <p className="gutter-row-subtitle mb-0">#{project.proj_id || "--"}</p>
                          </td>

                          <td>
                            <p className="gutter-row-label mb-0">{project.customer || "--"}</p>
                            <p className="gutter-row-subtitle mb-0">{project.project_address || "--"}</p>
                          </td>

                          <td>
                            <span className={`gutter-status-pill ${statusToneClass(statusName)}`}>
                              {statusName}
                            </span>
                          </td>

                          <td>
                            <p className="gutter-row-label mb-0">{manufacturerName}</p>
                            <p className="gutter-row-subtitle mb-0">Project Date: {formatProjectDate(project.date)}</p>
                          </td>

                          <td>
                            <p className="gutter-row-label mb-0">{tripLabel}</p>
                            {project.request_link ? (
                              <a
                                href={project.request_link}
                                target="_blank"
                                rel="noreferrer"
                                className="gutter-inline-link"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Open request link
                              </a>
                            ) : (
                              <p className="gutter-row-subtitle mb-0">No request link</p>
                            )}
                          </td>

                          <td className="text-end">
                            <p className="gutter-total-value mb-0">{projectTotalLabel}</p>
                            <p className="gutter-total-subnote mb-0">Deposit: {depositLabel}</p>
                          </td>

                          <td>
                            <p className="gutter-row-label mb-0">{createdByLabel}</p>
                            <p className="gutter-row-subtitle mb-0">{createdAtLabel}</p>
                          </td>

                          <td>
                            <p className="gutter-row-label mb-0">{updatedByLabel}</p>
                            <p className="gutter-row-subtitle mb-0">{updatedAtLabel}</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rowMenu ? (
                <div
                  className="gutter-row-menu"
                  style={{ top: rowMenu.y, left: rowMenu.x }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="gutter-row-menu-item"
                    onClick={() => openProject(rowMenu.projId)}
                  >
                    Open Project
                  </button>
                  <button
                    type="button"
                    className="gutter-row-menu-item"
                    onClick={() => openWorkOrder(rowMenu.projId)}
                  >
                    Open Work Order
                  </button>

                  <div className="gutter-row-menu-divider" />
                  <p className="gutter-row-menu-heading">Set Status</p>
                  {actionStatusOptions.map((statusNameOption) => (
                    <button
                      key={`${rowMenu.projId}-${statusNameOption}`}
                      type="button"
                      className="gutter-row-menu-item"
                      onClick={() => setProjectStatus(rowMenu.projId, statusNameOption)}
                    >
                      {statusNameOption}
                    </button>
                  ))}

                  <div className="gutter-row-menu-divider" />
                  <button
                    type="button"
                    className="gutter-row-menu-item gutter-row-menu-item-danger"
                    onClick={() => deleteProjectFromMenu(rowMenu.projId)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}

              <div className="gutter-table-footer">
                <p className="mb-0 text-muted">
                  Showing {showingCount} of {totalCount} projects
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}


