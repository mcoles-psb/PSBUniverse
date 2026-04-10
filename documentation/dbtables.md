# Database Tables

This document is generated from a live information_schema query against the current database.
Purpose, uses, route mapping, and relationships are described from current project code paths and DB constraints.

## gtr_m_project_extras

TABLE NAME: gtr_m_project_extras
PURPOSE: Stores optional project-specific line items that are outside standard gutter side calculations.
USES:
- Saves one-off charges such as custom materials, labor, or service add-ons.
- Adds extra amounts into quote calculations for subtotal and project total.
- Reloads with project details so extra lines can be reviewed and edited.
RELATED API ROUTES:
- No dedicated /api route (currently direct Supabase access in gutter project form).
RELATED UI PAGES:
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Outgoing FK: proj_id -> gtr_t_projects.proj_id
SCHEMA NAME: public
COLUMNS:
- extra_id
- proj_id
- name
- quantity
- unit_price
- created_at

## gtr_m_project_sides

TABLE NAME: gtr_m_project_sides
PURPOSE: Stores per-side measurements and installation inputs used to calculate quantities for each gutter project.
USES:
- Captures side-by-side geometry inputs entered in project create and edit forms.
- Drives gutter footage, downspout totals, and related pricing calculations.
- Feeds work-order and project-detail views with side-level breakdown data.
RELATED API ROUTES:
- No dedicated /api route (currently direct Supabase access in gutter project form).
RELATED UI PAGES:
- /gutter/new
- /gutter/[id]
- /gutter/[id]/work-order
RELATIONSHIPS:
- Outgoing FK: downspout_color_id -> core_s_colors.color_id
- Outgoing FK: gutter_color_id -> core_s_colors.color_id
- Outgoing FK: proj_id -> gtr_t_projects.proj_id
SCHEMA NAME: public
COLUMNS:
- side_id
- proj_id
- side_index
- segments
- length
- height
- downspout_qty
- gutter_color_id
- downspout_color_id
- created_at

## core_s_colors

TABLE NAME: core_s_colors
PURPOSE: Master lookup for available color options used in gutter and downspout selections.
USES:
- Populates color dropdown choices in gutter setup and project forms.
- Standardizes color names across all quotes and project records.
- Supports setup maintenance when admins add or rename color options.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/global
- /gutter/new
- /gutter/[id]
- /gutter/[id]/work-order
RELATIONSHIPS:
- Incoming FK: gtr_m_project_sides.downspout_color_id -> color_id
- Incoming FK: gtr_m_project_sides.gutter_color_id -> color_id
SCHEMA NAME: public
COLUMNS:
- color_id
- name
- created_at

## core_s_discounts

TABLE NAME: core_s_discounts
PURPOSE: Master lookup for predefined discount percentages that can be applied to gutter quotes.
USES:
- Provides selectable discount presets in gutter quote forms.
- Ensures discount values are consistent across projects.
- Supports setup updates when business discount offerings change.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/gutter
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Incoming FK: gtr_t_projects.discount_id -> discount_id
SCHEMA NAME: public
COLUMNS:
- discount_id
- percentage
- description
- created_at

## core_s_leaf_guards

TABLE NAME: core_s_leaf_guards
PURPOSE: Master lookup for leaf guard products and their default pricing.
USES:
- Provides selectable leaf guard options in project quotes.
- Supplies default price values used in quote calculations.
- Supports setup administration for leaf guard catalog changes.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/gutter
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Incoming FK: gtr_t_projects.leaf_guard_id -> leaf_guard_id
SCHEMA NAME: public
COLUMNS:
- leaf_guard_id
- name
- price
- created_at

## core_s_manufacturers

TABLE NAME: core_s_manufacturers
PURPOSE: Master lookup for manufacturers and their default material rates.
USES:
- Populates manufacturer selection in gutter project forms.
- Supplies default rate inputs for material cost calculations.
- Allows setup maintenance when manufacturer pricing changes.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/global
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Incoming FK: gtr_t_projects.manufacturer_id -> manufacturer_id
SCHEMA NAME: public
COLUMNS:
- manufacturer_id
- name
- rate
- created_at

## core_s_statuses

TABLE NAME: core_s_statuses
PURPOSE: Master lookup for gutter project status labels and descriptions.
USES:
- Populates status options in project list filters and editors.
- Labels each project state in the gutter dashboard.
- Supports setup updates to lifecycle states used by operations.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/global
- /gutter
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Incoming FK: gtr_t_projects.status_id -> status_id
SCHEMA NAME: public
COLUMNS:
- status_id
- name
- description

## core_s_trip_rates

TABLE NAME: core_s_trip_rates
PURPOSE: Master lookup for trip fee presets used when pricing gutter projects.
USES:
- Populates trip rate choices in project creation and editing.
- Supplies default trip fee amounts during quote calculations.
- Tracks rate changes with created and updated audit fields.
RELATED API ROUTES:
- /api/gutter/setup
RELATED UI PAGES:
- /setup/gutter
- /gutter/new
- /gutter/[id]
RELATIONSHIPS:
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
- Incoming FK: gtr_t_projects.trip_id -> trip_id
SCHEMA NAME: public
COLUMNS:
- trip_id
- label
- rate
- created_at
- updated_at
- created_by
- updated_by

## gtr_t_projects

TABLE NAME: gtr_t_projects
PURPOSE: Main transaction table that stores the project header, selected setup references, pricing overrides, and persisted total price for each gutter quote.
USES:
- Stores project-level data used by list, detail, edit, and work-order pages.
- Holds selected status, manufacturer, discount, trip, and leaf guard references.
- Persists pricing override, deposit, and total project price fields used in final quote output.
RELATED API ROUTES:
- /api/gutter/projects
- /api/gutter/setup
RELATED UI PAGES:
- /gutter
- /gutter/new
- /gutter/[id]
- /gutter/[id]/work-order
RELATIONSHIPS:
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
- Outgoing FK: discount_id -> core_s_discounts.discount_id
- Outgoing FK: leaf_guard_id -> core_s_leaf_guards.leaf_guard_id
- Outgoing FK: manufacturer_id -> core_s_manufacturers.manufacturer_id
- Outgoing FK: status_id -> core_s_statuses.status_id
- Outgoing FK: trip_id -> core_s_trip_rates.trip_id
- Incoming FK: gtr_m_project_extras.proj_id -> proj_id
- Incoming FK: gtr_m_project_sides.proj_id -> proj_id
SCHEMA NAME: public
COLUMNS:
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
- created_at
- updated_at
- leaf_guard_id
- cstm_trip_rate
- cstm_manufacturer_rate
- cstm_discount_percentage
- cstm_leaf_guard_price
- deposit_percent
- total_project_price
- created_by
- updated_by

## psb_m_appcardgroup

TABLE NAME: psb_m_appcardgroup
PURPOSE: Defines grouped sections used to organize app cards within each application's module launcher.
USES:
- Structures My Apps and setup cards into ordered group containers.
- Stores group display metadata such as icon, order, and active state.
- Supports admin setup flows that create, reorder, or retire groups.
RELATED API ROUTES:
- /api/my-apps
- /api/setup/cards
RELATED UI PAGES:
- /dashboard
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: app_id -> psb_s_application.app_id
- Incoming FK: psb_s_appcard.group_id -> group_id
SCHEMA NAME: public
COLUMNS:
- group_id
- app_id
- group_name
- group_desc
- display_order
- icon
- is_active
- created_at
- updated_at
- created_by
- updated_by

## psb_m_appcardroleaccess

TABLE NAME: psb_m_appcardroleaccess
PURPOSE: Mapping table that links cards to roles for card-level visibility and authorization.
USES:
- Filters which cards appear for a user based on assigned roles.
- Enforces role-based visibility in My Apps card retrieval APIs.
- Supports admin management of card-to-role assignments in setup screens.
RELATED API ROUTES:
- /api/my-apps
- /api/setup/cards
- /api/user-master/admin/roles
RELATED UI PAGES:
- /dashboard
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: card_id -> psb_s_appcard.card_id
- Outgoing FK: role_id -> psb_s_role.role_id
SCHEMA NAME: public
COLUMNS:
- acr_id
- card_id
- role_id
- is_active
- created_at
- updated_at
- created_by
- updated_by

## psb_m_userapproleaccess

TABLE NAME: psb_m_userapproleaccess
PURPOSE: Core access mapping table that assigns users to roles per application context.
USES:
- Drives runtime authorization checks for read and write actions.
- Determines which modules and cards are available to each logged-in user.
- Feeds realtime access refresh flows when role mappings are changed.
RELATED API ROUTES:
- /api/user-master/session
- /api/user-master/admin/access-mappings
- /api/my-apps
RELATED UI PAGES:
- /dashboard
- /setup/admin
- /profile
RELATIONSHIPS:
- Outgoing FK: app_id -> psb_s_application.app_id
- Outgoing FK: role_id -> psb_s_role.role_id
- Outgoing FK: user_id -> psb_s_user.user_id
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
SCHEMA NAME: public
COLUMNS:
- uar_id
- user_id
- role_id
- app_id
- is_active
- created_at
- updated_at
- updated_by
- created_by

## psb_s_appcard

TABLE NAME: psb_s_appcard
PURPOSE: Master table for app card definitions, including route targets and display metadata.
USES:
- Supplies card labels, routes, icons, and ordering for module launch UI.
- Acts as the source card catalog for role-based filtering.
- Enables admin configuration of cards without code changes.
RELATED API ROUTES:
- /api/my-apps
- /api/setup/cards
RELATED UI PAGES:
- /dashboard
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: app_id -> psb_s_application.app_id
- Outgoing FK: group_id -> psb_m_appcardgroup.group_id
- Incoming FK: psb_m_appcardroleaccess.card_id -> card_id
SCHEMA NAME: public
COLUMNS:
- card_id
- app_id
- group_id
- card_name
- card_desc
- route_path
- icon
- display_order
- is_active
- created_at
- updated_at
- created_by
- updated_by

## psb_s_application

TABLE NAME: psb_s_application
PURPOSE: Master registry of applications that can be assigned, secured, and displayed in the platform.
USES:
- Defines valid application records for role and user mapping.
- Controls which modules are eligible for My Apps card configuration.
- Supports active/inactive module lifecycle management.
RELATED API ROUTES:
- /api/user-master/admin/applications
- /api/setup/cards
- /api/setup/roles
- /api/my-apps
RELATED UI PAGES:
- /dashboard
- /setup/admin
RELATIONSHIPS:
- Incoming FK: psb_m_appcardgroup.app_id -> app_id
- Incoming FK: psb_m_userapproleaccess.app_id -> app_id
- Incoming FK: psb_s_appcard.app_id -> app_id
- Incoming FK: psb_s_role.app_id -> app_id
SCHEMA NAME: public
COLUMNS:
- app_id
- app_name
- app_desc
- is_active

## psb_s_company

TABLE NAME: psb_s_company
PURPOSE: Master company directory used for organizational ownership and contact metadata.
USES:
- Links users and departments to their owning company.
- Provides company contact details shown in profile and admin contexts.
- Serves as a reference table for company-scoped setup and validation.
RELATED API ROUTES:
- /api/user-master/admin/companies
- /api/user-master/bootstrap
- /api/user-master/profile
- /api/gutter/setup
RELATED UI PAGES:
- /company
- /profile
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
- Incoming FK: psb_s_department.comp_id -> comp_id
- Incoming FK: psb_s_user.comp_id -> comp_id
SCHEMA NAME: public
COLUMNS:
- comp_id
- comp_name
- short_name
- comp_email
- comp_phone
- is_active
- created_at
- updated_at
- created_by
- updated_by

## psb_s_department

TABLE NAME: psb_s_department
PURPOSE: Master department directory scoped by company.
USES:
- Links user accounts to department-level organization.
- Filters department options based on selected company in admin flows.
- Supports reporting and profile display by organizational unit.
RELATED API ROUTES:
- /api/user-master/admin/departments
- /api/user-master/bootstrap
- /api/user-master/profile
RELATED UI PAGES:
- /profile
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: comp_id -> psb_s_company.comp_id
- Incoming FK: psb_s_user.dept_id -> dept_id
SCHEMA NAME: public
COLUMNS:
- dept_id
- comp_id
- dept_name
- short_name
- is_active
- created_at
- updated_at

## psb_s_role

TABLE NAME: psb_s_role
PURPOSE: Master role catalog used to define role identities for authorization and module access.
USES:
- Supplies role records used in user-to-app role mappings.
- Enables role-based permission resolution in backend guards.
- Supports admin setup and assignment flows for access control.
RELATED API ROUTES:
- /api/user-master/admin/roles
- /api/setup/roles
- /api/setup/cards
- /api/my-apps
- /api/user-master/admin/access-mappings
RELATED UI PAGES:
- /profile
- /setup/admin
- /dashboard
RELATIONSHIPS:
- Outgoing FK: app_id -> psb_s_application.app_id
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
- Incoming FK: psb_m_appcardroleaccess.role_id -> role_id
- Incoming FK: psb_m_userapproleaccess.role_id -> role_id
SCHEMA NAME: public
COLUMNS:
- role_id
- role_name
- role_desc
- is_active
- created_at
- updated_at
- created_by
- updated_by
- app_id

## psb_s_status

TABLE NAME: psb_s_status
PURPOSE: Master user status catalog for account lifecycle and access eligibility.
USES:
- Defines status values assigned to user records.
- Controls whether account state is treated as active or restricted.
- Supports status-based gating in session and access resolution.
RELATED API ROUTES:
- /api/user-master/admin/statuses
- /api/user-master/bootstrap
- /api/user-master/profile
- /api/user-master/admin/users
RELATED UI PAGES:
- /profile
- /setup/admin
RELATIONSHIPS:
- Outgoing FK: created_by -> psb_s_user.user_id
- Outgoing FK: updated_by -> psb_s_user.user_id
- Incoming FK: psb_s_user.status_id -> status_id
SCHEMA NAME: public
COLUMNS:
- status_id
- sts_name
- sts_desc
- is_active
- created_at
- updated_at
- created_by
- updated_by

## psb_s_user

TABLE NAME: psb_s_user
PURPOSE: Primary user account table containing identity, profile, organization links, and password hash credentials.
USES:
- Authenticates users and stores password hash for login verification.
- Serves profile, session, and admin user management APIs.
- Anchors foreign key relationships to company, department, and status tables.
RELATED API ROUTES:
- /api/auth/login
- /api/auth/emulate
- /api/user-master/session
- /api/user-master/profile
- /api/user-master/admin/users
- /api/user-master/admin/access-mappings
RELATED UI PAGES:
- /login
- /profile
- /setup/admin
- /dashboard
RELATIONSHIPS:
- Outgoing FK: comp_id -> psb_s_company.comp_id
- Outgoing FK: dept_id -> psb_s_department.dept_id
- Outgoing FK: status_id -> psb_s_status.status_id
- Incoming FK: core_s_trip_rates.created_by -> user_id
- Incoming FK: core_s_trip_rates.updated_by -> user_id
- Incoming FK: gtr_t_projects.created_by -> user_id
- Incoming FK: gtr_t_projects.updated_by -> user_id
- Incoming FK: psb_m_userapproleaccess.user_id -> user_id
- Incoming FK: psb_m_userapproleaccess.created_by -> user_id
- Incoming FK: psb_m_userapproleaccess.updated_by -> user_id
- Incoming FK: psb_s_company.created_by -> user_id
- Incoming FK: psb_s_company.updated_by -> user_id
- Incoming FK: psb_s_role.created_by -> user_id
- Incoming FK: psb_s_role.updated_by -> user_id
- Incoming FK: psb_s_status.created_by -> user_id
- Incoming FK: psb_s_status.updated_by -> user_id
SCHEMA NAME: public
COLUMNS:
- user_id
- username
- email
- password_hash
- first_name
- middle_name
- last_name
- address
- phone
- comp_id
- dept_id
- position
- hire_date
- status_id
- is_active
- created_at
- updated_at
- created_by
- updated_by


