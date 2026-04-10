# Data Model

This document summarizes the tables currently referenced by application code.

## Gutter Transaction Tables

### gtr_t_projects

Header table for gutter projects.

Referenced fields include:

- proj_id
- project_name
- customer
- project_address
- status_id
- date
- trip_id
- manufacturer_id
- discount_id
- request_link
- leaf_guard_id
- cstm_trip_rate
- cstm_manufacturer_rate
- cstm_discount_percentage
- cstm_leaf_guard_price
- deposit_percent
- created_at
- updated_at

### gtr_m_project_sides

Child rows for project sections.

Referenced fields include:

- proj_id
- side_index
- segments
- length
- height
- downspout_qty
- gutter_color_id
- downspout_color_id

### gtr_m_project_extras

Child rows for optional extra items.

Referenced fields include:

- proj_id
- name
- quantity
- unit_price
- extra_id

## Gutter Setup Tables

- core_s_statuses
- core_s_colors
- core_s_manufacturers
- core_s_leaf_guards
- core_s_discounts
- core_s_trip_rates

## Company Profile Table

- PSB_S_Company

Referenced fields include:

- id
- email
- phone

## User Master Tables

- psb_s_user
- psb_s_company
- psb_s_department
- psb_s_role
- psb_s_application
- psb_s_status
- psb_m_userappproleaccess

Referenced access key:

- (user_id, role_id, app_id)

Special role behavior:

- role key devmain bypasses standard app checks and grants full CRUD.

## Notes

- IDs are used for setup lookups and foreign keys.
- Pricing overrides are stored in gtr_t_projects custom rate columns.
- Deposit is represented as deposit_percent and applied in pricing logic.
