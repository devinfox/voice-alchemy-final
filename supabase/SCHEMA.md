# Gold IRA CRM - Database Schema Documentation

## Overview

This CRM is designed specifically for precious metals and Gold IRA companies. It is **deal-centric** and **revenue-tracking first**, meaning every feature is built around tracking the flow of money through the sales pipeline.

## Quick Start

### Running Migrations

```bash
# Using Supabase CLI
supabase db push

# Or run migrations manually in order:
# 00001_extensions_and_enums.sql
# 00002_core_tables.sql
# 00003_deals_and_pipeline.sql
# 00004_calls_and_forms.sql
# 00005_financial_tracking.sql
# 00006_audit_and_events.sql
# 00007_triggers_and_functions.sql
# 00008_dashboard_views.sql
# 00009_rls_policies.sql
# 00010_seed_data.sql (development only)
```

## Entity Relationship Diagram (Simplified)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Campaign  │────▶│    Lead     │────▶│   Contact   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   ▼                   ▼
       │            ┌─────────────┐     ┌─────────────┐
       └───────────▶│    Deal     │◀────│    User     │
                    └─────────────┘     └─────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │   Funding   │  │ Commission  │  │  Turnover   │
   │   Events    │  │             │  │    (TO)     │
   └─────────────┘  └─────────────┘  └─────────────┘
```

## Core Tables

### Users (`users`)
Sales reps, managers, and admins who use the CRM.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `auth_id` | UUID | Links to Supabase Auth |
| `email` | VARCHAR | Unique email |
| `role` | user_role | sales_rep, senior_rep, closer, manager, admin, super_admin |
| `team_id` | UUID | FK to teams |
| `reports_to` | UUID | FK to users (manager) |
| `base_commission_rate` | DECIMAL | Default commission rate |
| `is_available_for_assignment` | BOOLEAN | For round-robin |

### Leads (`leads`)
Potential customers before qualification.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `status` | lead_status | new, contacted, qualified, unqualified, converted, dead |
| `source_type` | lead_source_type | ppc, organic, referral, etc. |
| `campaign_id` | UUID | FK to campaigns |
| `owner_id` | UUID | FK to users (assigned rep) |
| `score` | INTEGER | 0-100 lead score |
| `converted_deal_id` | UUID | FK to deal (if converted) |

### Contacts (`contacts`)
Qualified individuals, often converted from leads.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | Original lead |
| `owner_id` | UUID | FK to users |
| `date_of_birth` | DATE | For IRA eligibility |
| `is_accredited_investor` | BOOLEAN | Compliance |

### Deals (`deals`)
**The core revenue entity.** Every IRA transaction is a deal.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `deal_number` | SERIAL | Human-readable ID |
| `deal_type` | deal_type | new_ira, ira_rollover, ira_transfer, etc. |
| `stage` | deal_stage | Pipeline stage |
| `owner_id` | UUID | Current owner |
| `secondary_owner_id` | UUID | For splits |
| `estimated_value` | DECIMAL | Expected investment |
| `funded_amount` | DECIMAL | Actual $ received |
| `spread_amount` | DECIMAL | Gross profit |
| `gross_revenue` | DECIMAL | Company revenue |
| `commissionable_amount` | DECIMAL | Base for commission calc |
| `funds_received_at` | TIMESTAMPTZ | When money came in |
| `metals_purchased_at` | TIMESTAMPTZ | When metals bought |

## Financial Tracking

### Funding Events (`funding_events`)
All money movements on a deal.

```sql
-- Example: Recording a deposit
INSERT INTO funding_events (deal_id, transaction_type, amount, transaction_date)
VALUES ($deal_id, 'deposit', 150000.00, CURRENT_DATE);
```

| Transaction Types |
|-------------------|
| `deposit` - Money coming in |
| `withdrawal` - Money going out |
| `metal_purchase` - Buying metals |
| `metal_sale` - Selling metals |
| `fee` - Custodian/service fees |
| `adjustment` - Manual corrections |

### Commissions (`commissions`)
Individual commission records per rep per deal.

| Column | Type | Description |
|--------|------|-------------|
| `deal_id` | UUID | FK to deal |
| `user_id` | UUID | Rep earning commission |
| `commission_type` | commission_type | base, bonus, override, split, clawback |
| `base_amount` | DECIMAL | Amount commission calculated on |
| `commission_rate` | DECIMAL | Rate applied (e.g., 0.025 = 2.5%) |
| `commission_amount` | DECIMAL | Actual $ earned |
| `payment_status` | VARCHAR | pending, approved, paid, held |

### Turnovers (`turnovers`)
Deal handoffs between reps with revenue split tracking.

| Column | Type | Description |
|--------|------|-------------|
| `deal_id` | UUID | FK to deal |
| `from_user_id` | UUID | Original owner |
| `to_user_id` | UUID | New owner |
| `reason` | turnover_reason | expertise_needed, closing_specialist, etc. |
| `is_full_transfer` | BOOLEAN | Full transfer or split |
| `from_user_split_percentage` | DECIMAL | Original rep's % |
| `to_user_split_percentage` | DECIMAL | New rep's % |

## Pipeline Stages

The deal pipeline is configured in `deal_stage_config`:

| Stage | Probability | Description |
|-------|-------------|-------------|
| `new_opportunity` | 5% | Fresh lead |
| `initial_contact` | 10% | First conversation |
| `discovery` | 20% | Understanding needs |
| `proposal_sent` | 35% | Investment proposal delivered |
| `agreement_signed` | 50% | Paperwork signed |
| `paperwork_submitted` | 65% | Sent to custodian |
| `custodian_approved` | 75% | Account approved |
| `funding_pending` | 85% | Waiting for transfer |
| `funds_received` | 95% | Money in account |
| `metals_purchased` | 98% | Metals bought |
| `closed_won` | 100% | Deal completed |
| `closed_lost` | 0% | Deal lost |

## Event System

The CRM uses an event-driven architecture. Events are emitted automatically via triggers:

### Events Emitted

| Event | When |
|-------|------|
| `deal_created` | New deal inserted |
| `deal_stage_changed` | Stage transitions |
| `deal_owner_changed` | Ownership changes |
| `funding_received` | Deposit recorded |
| `metals_purchased` | Metal purchase recorded |
| `commission_calculated` | Commission created |
| `turnover_completed` | TO finalized |
| `lead_converted` | Lead becomes customer |
| `call_logged` | Significant call recorded |

### Using Events

```sql
-- Query pending events for webhook processing
SELECT * FROM system_events
WHERE status = 'pending'
ORDER BY created_at ASC;

-- Mark as processed
UPDATE system_events
SET status = 'completed', processed_at = NOW()
WHERE id = $event_id;
```

## Dashboard Views

Pre-built views for common reporting needs:

### `v_rep_performance`
Comprehensive rep metrics across time periods.

```sql
SELECT * FROM v_rep_performance
WHERE user_id = $rep_id;
```

Returns: today/week/month/quarter/year funded amounts, revenue, deals, calls, close rate, revenue per call, revenue per lead.

### `v_deal_pipeline`
Aggregated pipeline by stage.

```sql
SELECT * FROM v_deal_pipeline;
```

Returns: deal counts, total values, weighted values, average time in stage per pipeline stage.

### `v_team_performance`
Team-level aggregations.

### `v_campaign_performance`
Marketing ROI and attribution.

### `v_executive_dashboard`
Company-wide KPIs with MoM comparison.

### `v_time_to_close`
Average days per pipeline stage.

### `v_lead_source_attribution`
Revenue by lead source.

## Security (RLS)

Row Level Security is enabled on all tables. Policies enforce:

1. **Reps** can only see/edit their own leads, deals, contacts
2. **Managers** can see their direct reports' data
3. **Admins** have full access
4. **System** operations (triggers, webhooks) bypass RLS

### Helper Functions

```sql
-- Get current user's ID
SELECT get_current_user_id();

-- Check if admin
SELECT is_admin();

-- Check if manager+
SELECT is_manager_or_above();

-- Get managed user IDs
SELECT * FROM get_managed_user_ids();
```

## Soft Deletes

All tables use soft deletes. Records are never physically deleted:

```sql
-- "Delete" a lead
UPDATE leads SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $id;

-- Query active records only
SELECT * FROM leads WHERE is_deleted = FALSE;
```

All indexes include `WHERE is_deleted = FALSE` for optimal performance.

## AI Integration (Future)

The `calls` table is prepared for AI call analysis:

| Column | Purpose |
|--------|---------|
| `ai_analysis_status` | pending, processing, completed, failed |
| `transcription` | Full call transcription |
| `ai_summary` | AI-generated summary |
| `ai_sentiment` | positive, neutral, negative |
| `ai_objections` | Detected objections array |
| `ai_lead_quality_score` | 0-100 quality score |
| `ai_close_probability` | Predicted close rate |

## Common Operations

### Create a Deal from Lead

```sql
-- 1. Create contact from lead
INSERT INTO contacts (lead_id, first_name, last_name, email, phone, owner_id)
SELECT id, first_name, last_name, email, phone, owner_id
FROM leads WHERE id = $lead_id
RETURNING id INTO $contact_id;

-- 2. Create deal
INSERT INTO deals (
    name, deal_type, stage, contact_id, lead_id, owner_id,
    estimated_value, campaign_id, source_type
)
SELECT
    first_name || ' ' || last_name || ' - IRA Rollover',
    'ira_rollover', 'new_opportunity', $contact_id, id, owner_id,
    $estimated_value, campaign_id, source_type
FROM leads WHERE id = $lead_id
RETURNING id INTO $deal_id;

-- 3. Update lead status
UPDATE leads
SET status = 'converted',
    converted_contact_id = $contact_id,
    converted_deal_id = $deal_id
WHERE id = $lead_id;
```

### Record Funding

```sql
INSERT INTO funding_events (
    deal_id, transaction_type, amount, transaction_date, recorded_by
) VALUES (
    $deal_id, 'deposit', 150000.00, CURRENT_DATE, $user_id
);
-- Trigger automatically updates deal_revenue_summary and deal.funded_amount
```

### Initiate a Turnover

```sql
INSERT INTO turnovers (
    deal_id, from_user_id, to_user_id, reason, initiated_by,
    is_full_transfer, to_user_split_percentage
) VALUES (
    $deal_id, $from_rep_id, $to_rep_id, 'closing_specialist', $manager_id,
    FALSE, 70.00 -- 70% to closer, 30% to original rep
);
```

## Performance Indexes

Key indexes are created for:
- All foreign keys
- Common query patterns (owner lookups, stage filters)
- Date-based queries (created_at, funds_received_at)
- Text search (trigram indexes on name/email/phone)
- Composite indexes for dashboard queries

## Migration Files

| File | Purpose |
|------|---------|
| `00001_extensions_and_enums.sql` | UUID extension, all enum types |
| `00002_core_tables.sql` | users, teams, campaigns, leads, contacts |
| `00003_deals_and_pipeline.sql` | deals, stage config, stage history |
| `00004_calls_and_forms.sql` | calls, form submissions, call tags |
| `00005_financial_tracking.sql` | funding events, commissions, turnovers |
| `00006_audit_and_events.sql` | activity log, system events, notes, tasks |
| `00007_triggers_and_functions.sql` | All business logic triggers |
| `00008_dashboard_views.sql` | Pre-built reporting views |
| `00009_rls_policies.sql` | Row Level Security |
| `00010_seed_data.sql` | Development seed data |
