# Company Profile Application

Route: /company

## Purpose

Manage company email and phone values used by the portal profile area.

## Data Source

Table: PSB_S_Company

Fields in use:

- email
- phone

## Behavior

- Loads a single profile row.
- Save flow deletes existing rows and inserts one replacement row.
- Provides a preview panel for current values.
- Dynamic load/save feedback uses global toasts.
- Page follows global compact-density UI defaults.

## Cache Integration

- Reads profile with cache key company:profile.
- Invalidates company:profile on save.
- Refetches with forceFresh after successful save.
