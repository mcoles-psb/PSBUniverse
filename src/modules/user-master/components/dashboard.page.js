"use client";

import Link from "next/link";
import { Container, Row, Col, Card } from "react-bootstrap";

const tiles = [
  {
    category: "Operation",
    items: [
      {
        title: "Gutter Calculator",
        description: "Open the dedicated gutter quote calculator page.",
        href: "/gutter",
        cta: "Open Module",
      },
      {
        title: "OHD Calculator",
        description: "Open the overhead door calculator workflow page.",
        href: "/ohd",
        cta: "Open Module",
      },
    ],
  },
  {
    category: "Setup",
    items: [
      {
        title: "Global Setup Tables",
        description:
          "Manage shared Status, Color, and Manufacturer tables for all modules.",
        href: "/setup/global",
        cta: "Open Setup",
      },
      {
        title: "Gutter Calculator Setup Tables",
        description:
          "Manage gutter-specific setup values like leaf guard, discounts, and trip fee rates.",
        href: "/setup/gutter",
        cta: "Open Setup",
      },
    ],
  },
  {
    category: "Profile",
    items: [
      {
        title: "User Login",
        description:
          "Authenticate users and load role-to-application access from User Master tables.",
        href: "/login",
        cta: "Open Login",
      },
      {
        title: "User Profile",
        description:
          "Manage your psb_s_user profile, company, department, and status references.",
        href: "/profile",
        cta: "Open Profile",
      },
      {
        title: "Company Profile",
        description:
          "Update company contact details used across the app header and quote preview.",
        href: "/company",
        cta: "Open Profile",
      },
      {
        title: "Devmain/Admin Settings",
        description:
          "Manage users, roles, applications, and access mappings from centralized User Master tables.",
        href: "/setup/admin",
        cta: "Open Admin",
      },
    ],
  },
  {
    category: "Inquiry",
    items: [
      {
        title: "Travel Time",
        description: "Go to travel time and route planning calculations.",
        href: "/travel",
        cta: "Open Inquiry",
      },
    ],
  },
];

export default function HomePage() {
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
                  style={{ fontSize: "0.74rem", letterSpacing: "0.25em" }}
                >
                  Premium Gutters and Doors
                </p>
                <p className="mb-0" style={{ fontSize: "0.9rem" }}>
                  <strong>Email:</strong> Sales.pgd@premiumsteelgroup.com
                  <br />
                  <strong>Phone:</strong> 817-502-2520
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {tiles.map((section) => (
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
          <Row className="g-3">
            {section.items.map((tile) => (
              <Col key={tile.href} md={4}>
                <Link href={tile.href} className="tile-card bg-white">
                  <span className="tile-badge">{section.category}</span>
                  <h5 className="mt-2 mb-2">{tile.title}</h5>
                  <p className="text-muted" style={{ fontSize: "0.92rem" }}>
                    {tile.description}
                  </p>
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
