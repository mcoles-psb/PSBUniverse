"use client";

import { useEffect, useState } from "react";
import { Container, Row, Col, Card, Badge } from "react-bootstrap";
import { AUTH_CHANGE_EVENT, getStoredUser } from "@/lib/localAuth";

const upcomingItems = [
  { label: "Morning Brief", time: "8:30 AM - 9:00 AM" },
  { label: "Sales Follow-up", time: "10:00 AM - 11:15 AM" },
  { label: "Project Review", time: "2:30 PM - 3:30 PM" },
];

const quickStats = [
  { label: "Active Projects", value: "18" },
  { label: "Pending Quotes", value: "6" },
  { label: "Tasks Due", value: "4" },
];

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());

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

  const displayName = currentUser?.username || "Team Member";

  return (
    <Container className="profile-wrap py-4">
      <section className="profile-hero mb-4">
        <div className="profile-hero-sheen" />
        <div className="profile-hero-content">
          <p className="profile-kicker mb-2">My PSB</p>
          <h1 className="profile-title mb-2">Welcome back, {displayName}</h1>
          <p className="profile-subtitle mb-0">
            Keep your day focused and jump into your work from one place.
          </p>
        </div>
      </section>

      <Row className="g-3 align-items-stretch">
        <Col lg={4}>
          <Card className="profile-card h-100">
            <Card.Body>
              <p className="profile-section-label">Profile</p>
              <h2 className="profile-card-title">Account Snapshot</h2>
              <p className="text-muted mb-3">Your current workspace identity and role.</p>
              <div className="profile-row">
                <span className="profile-row-label">Username</span>
                <strong>{currentUser?.username || "-"}</strong>
              </div>
              <div className="profile-row">
                <span className="profile-row-label">Email</span>
                <strong>{currentUser?.email || "-"}</strong>
              </div>
              <div className="profile-row">
                <span className="profile-row-label">Team</span>
                <strong>Premium Gutters and Doors</strong>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col lg={8}>
          <Card className="profile-card h-100">
            <Card.Body>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div>
                  <p className="profile-section-label mb-1">Today</p>
                  <h2 className="profile-card-title mb-0">Daily Focus</h2>
                </div>
                <Badge bg="light" text="dark" className="profile-badge">
                  Action List
                </Badge>
              </div>
              <div className="profile-schedule-list">
                {upcomingItems.map((item) => (
                  <div key={item.label} className="profile-schedule-item">
                    <strong>{item.label}</strong>
                    <span>{item.time}</span>
                  </div>
                ))}
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mt-1">
        {quickStats.map((stat) => (
          <Col md={4} key={stat.label}>
            <Card className="profile-stat-card h-100">
              <Card.Body>
                <p className="profile-stat-label mb-1">{stat.label}</p>
                <p className="profile-stat-value mb-0">{stat.value}</p>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}
