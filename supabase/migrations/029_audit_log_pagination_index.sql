-- Sprint 3 Phase O: getAuditLog's keyset pagination always orders by
-- (created_at desc, id desc) — migration 028's separate single-column
-- indexes let the planner pick one for the workspace_id filter, then
-- sort the result in memory. A composite index matching the filter +
-- order exactly lets it walk the index in the already-correct order
-- instead, avoiding that sort as the table grows.
create index audit_log_workspace_id_created_at_id_idx
  on public.audit_log (workspace_id, created_at desc, id desc);
