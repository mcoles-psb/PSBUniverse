"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Container, Row, Col, Card } from "react-bootstrap";

const DEFAULT_CARD_ICON = "bi-grid-3x3-gap";
const DEFAULT_GROUP_ICON = "bi-collection";

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function toIconClass(iconValue, fallbackIcon) {
  const raw = String(iconValue || "").trim();
  if (!raw) return `bi ${fallbackIcon}`;

  if (raw.includes(" ")) {
    return raw;
  }

  if (raw.startsWith("bi-")) {
    return `bi ${raw}`;
  }

  return `bi ${raw}`;
}

function normalizeGroups(payload) {
  const source = Array.isArray(payload?.groups) ? payload.groups : [];

  return source.map((group) => ({
    group_id: group?.group_id,
    group_name: String(group?.group_name || "Application").trim(),
    group_desc: String(group?.group_desc || "").trim(),
    group_icon: String(group?.group_icon || "").trim(),
    group_order: Number(group?.group_order || 0),
    cards: (Array.isArray(group?.cards) ? group.cards : []).map((card) => ({
      card_id: card?.card_id,
      card_name: String(card?.card_name || "Module").trim(),
      card_desc: String(card?.description || card?.card_desc || "").trim(),
      route_path: String(card?.route || card?.route_path || "").trim(),
      icon: String(card?.icon || "").trim(),
    })),
  }));
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [groups, setGroups] = useState([]);

  const hasGroups = useMemo(() => groups.length > 0, [groups]);

  useEffect(() => {
    async function loadApps() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/my-apps", {
          method: "GET",
          cache: "no-store",
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setGroups([]);
          setErrorMessage(
            payload?.message || "Unable to load your applications. Please try again."
          );
          return;
        }

        setGroups(normalizeGroups(payload));
      } catch {
        setGroups([]);
        setErrorMessage("Unable to load your applications. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    void loadApps();
  }, []);

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
              style={{ letterSpacing: "0.08em" }}
            >
              PSB Portal
            </p>
            <h1 className="fw-bold">Quote Engine</h1>
            <p className="text-muted mt-2">
              Premium Gutters and Doors quoting workspace. Select an area below
              to continue.
            </p>
          </Col>
          <Col md={5}>
            <Card className="shadow-sm">
              <Card.Body>
                <p className="fw-bold mb-0">Premium Steel Building</p>
                <p
                  className="text-muted text-uppercase mb-2"
                  style={{ letterSpacing: "0.25em" }}
                >
                  Premium Gutters and Doors
                </p>
                <p className="mb-0">
                  <strong>Email:</strong> Sales.pgd@premiumsteelgroup.com
                  <br />
                  <strong>Phone:</strong> 817-502-2520
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {loading ? (
        <div className="my-apps-skeleton-stack">
          {[1, 2].map((sectionIndex) => (
            <div key={`skeleton-group-${sectionIndex}`} className="mb-4">
              <div className="my-apps-skeleton-line my-apps-skeleton-line-header" />
              <Row className="g-3">
                {[1, 2, 3].map((cardIndex) => (
                  <Col key={`skeleton-card-${sectionIndex}-${cardIndex}`} md={4}>
                    <div className="tile-card bg-white my-apps-skeleton-card">
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-icon" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-title" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-copy" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-copy short" />
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
        </div>
      ) : hasValue(errorMessage) ? (
        <div className="notice-banner notice-banner-danger mb-0">{errorMessage}</div>
      ) : !hasGroups ? (
        <div className="notice-banner notice-banner-warning mb-0">
          No application modules are currently assigned to your account.
        </div>
      ) : (
        groups.map((group) => (
          <div key={`group-${group.group_id || group.group_name}`} className="mb-4">
            <div className="my-apps-group-heading">
              <i
                className={toIconClass(group.group_icon, DEFAULT_GROUP_ICON)}
                aria-hidden="true"
              />
              <div>
                <p className="text-uppercase fw-bold mb-0 tile-badge">{group.group_name}</p>
                {hasValue(group.group_desc) ? (
                  <p className="text-muted mb-0 my-apps-group-desc">{group.group_desc}</p>
                ) : null}
              </div>
            </div>

            <Row className="g-3 mt-1">
              {group.cards.map((card) => (
                <Col key={`card-${card.card_id || card.route_path}`} md={4}>
                  <Link href={card.route_path} className="tile-card bg-white my-app-card">
                    <div className="my-app-card-icon">
                      <i
                        className={toIconClass(card.icon, DEFAULT_CARD_ICON)}
                        aria-hidden="true"
                      />
                    </div>
                    <h5 className="mt-2 mb-2">{card.card_name}</h5>
                    <p className="text-muted my-app-card-copy">{card.card_desc || "Open module."}</p>
                    <span className="tile-cta">Open Module</span>
                  </Link>
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}
    </Container>
  );
}
