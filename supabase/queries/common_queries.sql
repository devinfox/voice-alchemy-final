-- ============================================================================
-- GOLD IRA CRM - Common SQL Queries
-- Reference queries for application development
-- ============================================================================

-- ============================================================================
-- LEAD MANAGEMENT QUERIES
-- ============================================================================

-- Get unassigned leads for round-robin assignment
SELECT l.*
FROM leads l
WHERE l.is_deleted = FALSE
  AND l.owner_id IS NULL
  AND l.status = 'new'
ORDER BY l.created_at ASC;

-- Get leads by status with owner info
SELECT
    l.*,
    u.first_name || ' ' || u.last_name AS owner_name,
    c.name AS campaign_name
FROM leads l
LEFT JOIN users u ON l.owner_id = u.id
LEFT JOIN campaigns c ON l.campaign_id = c.id
WHERE l.is_deleted = FALSE
  AND l.status = $1 -- Parameter: status
ORDER BY l.created_at DESC
LIMIT 50;

-- Lead conversion funnel (last 30 days)
SELECT
    status,
    COUNT(*) AS lead_count,
    ROUND(COUNT(*)::DECIMAL / SUM(COUNT(*)) OVER () * 100, 2) AS percentage
FROM leads
WHERE is_deleted = FALSE
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY status
ORDER BY
    CASE status
        WHEN 'new' THEN 1
        WHEN 'contacted' THEN 2
        WHEN 'qualified' THEN 3
        WHEN 'converted' THEN 4
        WHEN 'unqualified' THEN 5
        WHEN 'dead' THEN 6
    END;

-- ============================================================================
-- DEAL MANAGEMENT QUERIES
-- ============================================================================

-- Get deals in pipeline (active, not closed)
SELECT
    d.*,
    c.first_name || ' ' || c.last_name AS contact_name,
    c.phone AS contact_phone,
    u.first_name || ' ' || u.last_name AS owner_name,
    dsc.display_name AS stage_name,
    dsc.probability,
    EXTRACT(DAYS FROM NOW() - d.stage_entered_at) AS days_in_stage
FROM deals d
LEFT JOIN contacts c ON d.contact_id = c.id
LEFT JOIN users u ON d.owner_id = u.id
LEFT JOIN deal_stage_config dsc ON d.stage = dsc.stage
WHERE d.is_deleted = FALSE
  AND d.stage NOT IN ('closed_won', 'closed_lost')
ORDER BY dsc.display_order, d.stage_entered_at ASC;

-- Get deals for a specific rep with revenue info
SELECT
    d.id,
    d.deal_number,
    d.name,
    d.stage,
    d.estimated_value,
    d.funded_amount,
    d.gross_revenue,
    d.created_at,
    d.funds_received_at,
    drs.total_funded,
    drs.gross_spread,
    drs.total_commissions
FROM deals d
LEFT JOIN deal_revenue_summary drs ON d.id = drs.deal_id
WHERE d.owner_id = $1 -- Parameter: user_id
  AND d.is_deleted = FALSE
ORDER BY d.created_at DESC;

-- Stale deals alert (stuck in stage too long)
SELECT
    d.*,
    dsc.display_name AS stage_name,
    dsc.alert_after_days,
    EXTRACT(DAYS FROM NOW() - d.stage_entered_at) AS days_in_stage,
    u.email AS owner_email
FROM deals d
JOIN deal_stage_config dsc ON d.stage = dsc.stage
JOIN users u ON d.owner_id = u.id
WHERE d.is_deleted = FALSE
  AND d.stage NOT IN ('closed_won', 'closed_lost')
  AND dsc.alert_after_days IS NOT NULL
  AND EXTRACT(DAYS FROM NOW() - d.stage_entered_at) > dsc.alert_after_days
ORDER BY days_in_stage DESC;

-- Deal velocity (average time per stage for won deals)
SELECT
    dsh.to_stage,
    dsc.display_name,
    COUNT(*) AS transitions,
    ROUND(AVG(dsh.time_in_stage_seconds) / 86400.0, 1) AS avg_days
FROM deal_stage_history dsh
JOIN deals d ON dsh.deal_id = d.id
JOIN deal_stage_config dsc ON dsh.to_stage = dsc.stage
WHERE d.stage = 'closed_won'
  AND d.is_deleted = FALSE
  AND dsh.time_in_stage_seconds IS NOT NULL
GROUP BY dsh.to_stage, dsc.display_name, dsc.display_order
ORDER BY dsc.display_order;

-- ============================================================================
-- FINANCIAL QUERIES
-- ============================================================================

-- Revenue by period
SELECT
    DATE_TRUNC('month', funds_received_at) AS month,
    COUNT(*) AS deals_funded,
    SUM(funded_amount) AS total_funded,
    SUM(gross_revenue) AS total_revenue,
    AVG(funded_amount) AS avg_deal_size
FROM deals
WHERE is_deleted = FALSE
  AND funds_received_at IS NOT NULL
GROUP BY DATE_TRUNC('month', funds_received_at)
ORDER BY month DESC;

-- Rep commission summary (current month)
SELECT
    u.id AS user_id,
    u.first_name || ' ' || u.last_name AS rep_name,
    COUNT(c.id) AS commission_count,
    SUM(c.commission_amount) AS total_earned,
    SUM(c.commission_amount) FILTER (WHERE c.payment_status = 'paid') AS total_paid,
    SUM(c.commission_amount) FILTER (WHERE c.payment_status = 'pending') AS total_pending
FROM users u
LEFT JOIN commissions c ON c.user_id = u.id
    AND c.is_deleted = FALSE
    AND c.commission_period = DATE_TRUNC('month', CURRENT_DATE)
WHERE u.is_deleted = FALSE
  AND u.role IN ('sales_rep', 'senior_rep', 'closer')
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_earned DESC NULLS LAST;

-- Top deals by revenue (all time)
SELECT
    d.id,
    d.deal_number,
    d.name,
    d.funded_amount,
    d.gross_revenue,
    d.closed_at,
    u.first_name || ' ' || u.last_name AS owner_name,
    c.first_name || ' ' || c.last_name AS contact_name,
    camp.name AS campaign_name
FROM deals d
JOIN users u ON d.owner_id = u.id
LEFT JOIN contacts c ON d.contact_id = c.id
LEFT JOIN campaigns camp ON d.campaign_id = camp.id
WHERE d.is_deleted = FALSE
  AND d.stage = 'closed_won'
ORDER BY d.gross_revenue DESC
LIMIT 20;

-- ============================================================================
-- CALL ANALYTICS QUERIES
-- ============================================================================

-- Call volume by rep (today)
SELECT
    u.id AS user_id,
    u.first_name || ' ' || u.last_name AS rep_name,
    COUNT(c.id) AS total_calls,
    COUNT(c.id) FILTER (WHERE c.direction = 'inbound') AS inbound_calls,
    COUNT(c.id) FILTER (WHERE c.direction = 'outbound') AS outbound_calls,
    COUNT(c.id) FILTER (WHERE c.disposition = 'answered') AS answered_calls,
    SUM(c.duration_seconds) / 60 AS total_talk_minutes,
    AVG(c.duration_seconds) AS avg_call_duration_seconds
FROM users u
LEFT JOIN calls c ON c.user_id = u.id
    AND c.is_deleted = FALSE
    AND c.started_at >= CURRENT_DATE
WHERE u.is_deleted = FALSE
  AND u.role IN ('sales_rep', 'senior_rep', 'closer')
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_calls DESC;

-- Calls pending AI analysis
SELECT
    c.id,
    c.started_at,
    c.duration_seconds,
    c.recording_url,
    c.user_id,
    u.first_name || ' ' || u.last_name AS rep_name
FROM calls c
JOIN users u ON c.user_id = u.id
WHERE c.is_deleted = FALSE
  AND c.ai_analysis_status = 'pending'
  AND c.recording_url IS NOT NULL
  AND c.duration_seconds > 60 -- Only analyze calls > 1 minute
ORDER BY c.started_at ASC
LIMIT 100;

-- Call to conversion rate by campaign
SELECT
    camp.name AS campaign_name,
    COUNT(DISTINCT c.id) AS total_calls,
    COUNT(DISTINCT l.id) AS leads_from_calls,
    COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted') AS converted_leads,
    ROUND(
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'converted')::DECIMAL /
        NULLIF(COUNT(DISTINCT l.id), 0) * 100
    , 2) AS conversion_rate
FROM campaigns camp
LEFT JOIN calls c ON c.campaign_id = camp.id AND c.is_deleted = FALSE
LEFT JOIN leads l ON l.campaign_id = camp.id AND l.is_deleted = FALSE
WHERE camp.is_deleted = FALSE
GROUP BY camp.id, camp.name
ORDER BY total_calls DESC;

-- ============================================================================
-- TURNOVER (TO) QUERIES
-- ============================================================================

-- Recent turnovers
SELECT
    t.id,
    t.created_at,
    t.reason,
    t.is_full_transfer,
    t.from_user_split_percentage,
    t.to_user_split_percentage,
    d.name AS deal_name,
    d.estimated_value,
    from_user.first_name || ' ' || from_user.last_name AS from_rep,
    to_user.first_name || ' ' || to_user.last_name AS to_rep,
    initiated.first_name || ' ' || initiated.last_name AS initiated_by
FROM turnovers t
JOIN deals d ON t.deal_id = d.id
JOIN users from_user ON t.from_user_id = from_user.id
JOIN users to_user ON t.to_user_id = to_user.id
LEFT JOIN users initiated ON t.initiated_by = initiated.id
WHERE t.is_deleted = FALSE
ORDER BY t.created_at DESC
LIMIT 50;

-- TO stats by rep (who TOs most, who receives most)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name AS rep_name,
    COUNT(t_from.id) AS tos_given,
    COUNT(t_to.id) AS tos_received,
    COALESCE(SUM(t_from.deal_value_at_turnover), 0) AS value_given,
    COALESCE(SUM(t_to.deal_value_at_turnover), 0) AS value_received
FROM users u
LEFT JOIN turnovers t_from ON t_from.from_user_id = u.id AND t_from.is_deleted = FALSE
LEFT JOIN turnovers t_to ON t_to.to_user_id = u.id AND t_to.is_deleted = FALSE
WHERE u.is_deleted = FALSE
  AND u.role IN ('sales_rep', 'senior_rep', 'closer')
GROUP BY u.id, u.first_name, u.last_name
ORDER BY tos_given DESC;

-- ============================================================================
-- ASSIGNMENT QUERIES
-- ============================================================================

-- Get next rep for round-robin assignment
WITH rep_assignments AS (
    SELECT
        u.id,
        u.first_name || ' ' || u.last_name AS name,
        u.assignment_weight,
        COUNT(l.id) FILTER (WHERE l.created_at >= CURRENT_DATE) AS leads_today,
        MAX(l.assigned_at) AS last_assigned_at
    FROM users u
    LEFT JOIN leads l ON l.owner_id = u.id AND l.is_deleted = FALSE
    WHERE u.is_deleted = FALSE
      AND u.is_active = TRUE
      AND u.is_available_for_assignment = TRUE
      AND u.team_id = $1 -- Parameter: team_id
      AND u.role IN ('sales_rep', 'senior_rep')
    GROUP BY u.id, u.first_name, u.last_name, u.assignment_weight
)
SELECT
    id,
    name,
    assignment_weight,
    leads_today,
    -- Score: lower is better (gets assigned next)
    leads_today::DECIMAL / NULLIF(assignment_weight, 0) AS assignment_score
FROM rep_assignments
ORDER BY assignment_score ASC NULLS FIRST, last_assigned_at ASC NULLS FIRST
LIMIT 1;

-- ============================================================================
-- FORM SUBMISSION QUERIES
-- ============================================================================

-- Unprocessed form submissions
SELECT
    fs.*,
    c.name AS campaign_name
FROM form_submissions fs
LEFT JOIN campaigns c ON fs.campaign_id = c.id
WHERE fs.is_deleted = FALSE
  AND fs.is_processed = FALSE
  AND fs.is_spam = FALSE
ORDER BY fs.created_at ASC;

-- Duplicate detection query
SELECT
    fs.id,
    fs.submitted_email,
    fs.submitted_phone,
    fs.created_at,
    l.id AS existing_lead_id,
    l.first_name || ' ' || l.last_name AS existing_lead_name
FROM form_submissions fs
LEFT JOIN leads l ON (
    (l.email = fs.submitted_email AND fs.submitted_email IS NOT NULL)
    OR (l.phone = fs.submitted_phone AND fs.submitted_phone IS NOT NULL)
)
WHERE fs.is_deleted = FALSE
  AND fs.is_processed = FALSE
  AND l.id IS NOT NULL;

-- ============================================================================
-- ACTIVITY / AUDIT QUERIES
-- ============================================================================

-- Recent activity for a deal
SELECT
    al.created_at,
    al.event_type,
    al.event_description,
    al.changes,
    u.first_name || ' ' || u.last_name AS user_name
FROM activity_log al
LEFT JOIN users u ON al.user_id = u.id
WHERE al.deal_id = $1 -- Parameter: deal_id
ORDER BY al.created_at DESC
LIMIT 100;

-- User activity summary (last 7 days)
SELECT
    u.id,
    u.first_name || ' ' || u.last_name AS name,
    COUNT(al.id) AS total_activities,
    COUNT(al.id) FILTER (WHERE al.event_type = 'deal_created') AS deals_created,
    COUNT(al.id) FILTER (WHERE al.event_type = 'deal_stage_changed') AS stage_changes,
    COUNT(al.id) FILTER (WHERE al.event_type = 'call_logged') AS calls_logged,
    COUNT(al.id) FILTER (WHERE al.event_type = 'note_added') AS notes_added
FROM users u
LEFT JOIN activity_log al ON al.user_id = u.id
    AND al.created_at >= NOW() - INTERVAL '7 days'
WHERE u.is_deleted = FALSE
  AND u.is_active = TRUE
GROUP BY u.id, u.first_name, u.last_name
ORDER BY total_activities DESC;

-- ============================================================================
-- SEARCH QUERIES (using trigram indexes)
-- ============================================================================

-- Search leads by name/email/phone
SELECT *
FROM leads
WHERE is_deleted = FALSE
  AND (
    first_name || ' ' || last_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')
  ) ILIKE '%' || $1 || '%' -- Parameter: search_term
ORDER BY
    CASE
        WHEN first_name ILIKE $1 || '%' THEN 1
        WHEN last_name ILIKE $1 || '%' THEN 2
        ELSE 3
    END,
    created_at DESC
LIMIT 20;

-- Search contacts
SELECT *
FROM contacts
WHERE is_deleted = FALSE
  AND (
    first_name || ' ' || last_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')
  ) ILIKE '%' || $1 || '%' -- Parameter: search_term
ORDER BY created_at DESC
LIMIT 20;
