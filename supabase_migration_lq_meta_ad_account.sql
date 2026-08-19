-- Links each lq_clients client to their Meta ad account, so the Meta Ads
-- dashboard (app/dashboard/meta-ads) can be driven by real clients instead
-- of a hardcoded account list.
alter table lq_clients add column if not exists meta_ad_account_id text;
