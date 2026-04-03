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
import { supabase } from "@/lib/supabase";

export default function GutterCalculatorPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gtr_t_projects")
      .select("id, project_name, project_id, status, customer, updated_at")
      .order("updated_at", { ascending: false });

    if (!error && data) {
      setProjects(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProjects();
    }, 0);

    return () => clearTimeout(timer);
  }, [loadProjects]);

  const updateStatus = async (id, status) => {
    await supabase.from("gtr_t_projects").update({ status }).eq("id", id);
    loadProjects();
  };

  const deleteProject = async (id) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await supabase.from("gtr_t_projects").delete().eq("id", id);
    loadProjects();
  };

  const formatDate = (iso) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleString();
  };

  return (
    <Container className="py-4" style={{ maxWidth: 1000 }}>
      <div className="d-flex align-items-center mb-3">
        <Link href="/" className="back-link me-3">
          ← Back
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
              key={project.id}
              className="d-flex justify-content-between align-items-center"
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/gutter/${project.id}`)}
            >
              <div>
                <p className="fw-bold mb-0">
                  {project.project_name || "(Untitled project)"}
                </p>
                <p className="text-muted mb-0" style={{ fontSize: "0.84rem" }}>
                  ID: {project.project_id || "--"} |{" "}
                  <Badge bg="secondary" className="me-1">
                    {project.status || "In Progress"}
                  </Badge>{" "}
                  | Last updated: {formatDate(project.updated_at)}
                </p>
              </div>
              <Dropdown onClick={(e) => e.stopPropagation()}>
                <Dropdown.Toggle variant="outline-secondary" size="sm">
                  ⋮
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  <Dropdown.Item
                    onClick={() => updateStatus(project.id, "Completed")}
                  >
                    Mark as Complete
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() => updateStatus(project.id, "Cancelled")}
                  >
                    Mark as Cancelled
                  </Dropdown.Item>
                  <Dropdown.Item
                    onClick={() =>
                      router.push(`/gutter/${project.id}/work-order`)
                    }
                  >
                    Work Order
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    className="text-danger"
                    onClick={() => deleteProject(project.id)}
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
