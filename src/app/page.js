"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Container, Row, Col, Card, Spinner } from "react-bootstrap";
import { AUTH_CHANGE_EVENT, getStoredUser } from "@/lib/localAuth";

function normalizeAppName(value) {
  return String(value ?? "").trim().toLowerCase();
}

const tiles = [
  {
    category: "Gutter Apps",
    description: "Dedicated tools for gutter quoting and gutter setup workflows.",
    items: [
      {
        title: "Gutter Calculator",
        description: "Open the dedicated gutter quote calculator page.",
        href: "/gutter",
        cta: "Open Module",
        appName: "Gutter Calculator",
      },
      {
        title: "Gutter Calculator Setup Tables",
        description:
          "Manage gutter-specific setup values like leaf guard, discounts, and trip fee rates.",
        href: "/setup/gutter",
        cta: "Open Setup",
        appName: "Gutter Calculator",
      },
    ],
  },
  {
    category: "Door Apps",
    description: "Overhead door operations and supporting workflows.",
    items: [
      {
        title: "OHD Calculator",
        description: "Open the overhead door calculator workflow page.",
        href: "/ohd",
        cta: "Open Module",
        appName: "OHD Calculator",
      },
    ],
  },
  {
    category: "Shared Setup",
    description: "Configuration that applies across multiple modules.",
    items: [
      {
        title: "Global Setup Tables",
        description:
          "Manage shared Status, Color, and Manufacturer tables for all modules.",
        href: "/setup/global",
        cta: "Open Setup",
        appName: "Global Setup",
      },
    ],
  },
];

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState("");
  const [accessibleApps, setAccessibleApps] = useState([]);
  const [isDevMain, setIsDevMain] = useState(Boolean(getStoredUser()?.isDevMain));

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getStoredUser());
    }

    window.addEventListener("storage", syncUser);
    window.addEventListener(AUTH_CHANGE_EVENT, syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener(AUTH_CHANGE_EVENT, syncUser);
    };
  }, []);

  useEffect(() => {
    async function loadApps() {
      if (!currentUser?.userId) {
        setAccessibleApps([]);
        setAppsLoading(false);
        return;
      }

      setAppsLoading(true);
      setAppsError("");

      try {
        const response = await fetch(
          `/api/me/apps?actorUserId=${encodeURIComponent(currentUser.userId)}`,
          { method: "GET" }
        );
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setAppsError(payload?.error || "Unable to load app access.");
          setAppsLoading(false);
          return;
        }

        setAccessibleApps(payload?.apps ?? []);
        setIsDevMain(Boolean(payload?.isDevMain || currentUser?.isDevMain));
      } catch (_error) {
        setAppsError("Unable to load app access right now.");
      } finally {
        setAppsLoading(false);
      }
    }

    loadApps();
  }, [currentUser]);

  const rolesByAppName = useMemo(() => {
    const map = new Map();
    for (const app of accessibleApps) {
      map.set(normalizeAppName(app.app_name), app.roleNames ?? []);
    }
    return map;
  }, [accessibleApps]);

  const visibleSections = useMemo(() => {
    if (isDevMain) {
      return tiles;
    }

    const allowed = new Set(accessibleApps.map((app) => normalizeAppName(app.app_name)));

    return tiles
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => allowed.has(normalizeAppName(item.appName))),
      }))
      .filter((section) => section.items.length > 0);
  }, [accessibleApps, isDevMain]);

  const hasVisibleApps = visibleSections.some((section) => section.items.length > 0);

  return (
    <Container className="py-4" style={{ maxWidth: 1200 }}>
      <div
        className="p-4 mb-4 rounded-3"
        style={{
          background: "linear-gradient(145deg, #ffffff 0%, #f3f8fc 72%)",
          border: "1px solid #b4c7d9",
        }}
      >
        <Row>
          <Col md={7}>
            <p
              className="text-muted text-uppercase mb-1"
              style={{ fontSize: "0.74rem", letterSpacing: "0.08em" }}
            >
              PSBUniverse
            </p>
            <h1 className="fw-bold">My Apps</h1>
            <p className="text-muted mt-2">
              Select an application area below to continue your work.
            </p>

            {appsError ? <Alert variant="warning" className="mt-3 mb-0">{appsError}</Alert> : null}
          </Col>
          <Col md={5}>
            <Card className="shadow-sm">
              <Card.Body>
                <p className="fw-bold mb-0">App Access</p>
                <p
                  className="text-muted text-uppercase mb-2"
                  style={{ fontSize: "0.74rem", letterSpacing: "0.25em" }}
                >
                  Dynamic Access Matrix
                </p>

                {appsLoading ? (
                  <p className="mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.9rem" }}>
                    <Spinner animation="border" size="sm" />
                    Loading app access...
                  </p>
                ) : isDevMain ? (
                  <p className="mb-0" style={{ fontSize: "0.9rem" }}>
                    <strong>Role:</strong> DEVMAIN
                    <br />
                    You have access to all active apps.
                  </p>
                ) : accessibleApps.length > 0 ? (
                  <div className="d-flex flex-column gap-2">
                    {accessibleApps.map((app) => (
                      <div key={app.app_id} className="d-flex flex-wrap justify-content-between gap-2">
                        <strong style={{ fontSize: "0.9rem" }}>{app.app_name}</strong>
                        <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                          Role: {(app.roleNames ?? []).join(", ") || "USER"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mb-0" style={{ fontSize: "0.9rem" }}>
                    No app access rows found for this user. Contact admin.
                  </p>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {!hasVisibleApps && !appsLoading ? (
        <Alert variant="info">No applications are currently assigned to this account.</Alert>
      ) : null}

      {visibleSections.map((section) => (
        <div key={section.category} className="mb-4">
          <p
            className="text-uppercase fw-bold mb-2"
            style={{
              fontSize: "0.76rem",
              letterSpacing: "0.08em",
              color: "#1f5f93",
            }}
          >
            {section.category}
          </p>
          <p className="text-muted mb-3" style={{ fontSize: "0.9rem" }}>
            {section.description}
          </p>
          <Row className="g-3">
            {section.items.map((tile) => (
              <Col key={tile.href} md={4}>
                <Link href={tile.href} className="tile-card bg-white">
                  <span className="tile-badge">{section.category}</span>
                  <h5 className="mt-2 mb-2">{tile.title}</h5>
                  <p className="text-muted" style={{ fontSize: "0.92rem" }}>
                    {tile.description}
                  </p>
                  {!isDevMain ? (
                    <p className="mb-2" style={{ fontSize: "0.8rem" }}>
                      <Badge bg="light" text="dark">
                        Role: {(rolesByAppName.get(normalizeAppName(tile.appName)) ?? ["USER"]).join(", ")}
                      </Badge>
                    </p>
                  ) : null}
                  <span className="tile-cta">{tile.cta}</span>
                </Link>
              </Col>
            ))}
          </Row>
        </div>
      ))}
    </Container>
  );
}
