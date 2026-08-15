-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Splits Stage 01 + Ad Concepts into per-service tabs (see
-- app/dashboard/campaign-setup/page.tsx). offer_pricing, job_value_margins,
-- competitor_research, lead_qualification_criteria, retargeting_strategy,
-- and ad_concepts were all one shared set per client — now they live per
-- service under service_details, keyed by service name (matching
-- lq_client_configs.services). ideal_customer and budget_targeting stay
-- top-level/shared across a client's services, since the same audience and
-- spend apply regardless of which service tab you're looking at.
--
-- IMPORTANT: this drops the 6 old flat columns. Before running against a
-- database with real data in them, backfill into service_details first,
-- e.g.:
--   update campaign_briefs set service_details = jsonb_build_object(
--     '<service name>', jsonb_build_object(
--       'offer_pricing', offer_pricing, 'job_value_margins', job_value_margins,
--       'competitor_research', competitor_research,
--       'lead_qualification_criteria', lead_qualification_criteria,
--       'retargeting_strategy', retargeting_strategy, 'ad_concepts', ad_concepts
--     )
--   ) where client_id = '<client id>';
alter table campaign_briefs add column service_details jsonb not null default '{}';

alter table campaign_briefs drop column offer_pricing;
alter table campaign_briefs drop column job_value_margins;
alter table campaign_briefs drop column competitor_research;
alter table campaign_briefs drop column lead_qualification_criteria;
alter table campaign_briefs drop column retargeting_strategy;
alter table campaign_briefs drop column ad_concepts;
