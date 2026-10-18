-- ---------------------------------------------------------------------------
-- CRM read-path indexes
--
-- Why: every table below had NO indexes at all (not even a primary key), so
-- MariaDB had no choice but full table scans joined with block nested loops.
-- On the check-availability query that multiplied
--   1391 leads x 2724 listings x 1625 users x 33 renews
-- into roughly 5.9e12 intermediate rows and it never finished (killed after
-- 1,800,000 ms). EXPLAIN showed type=ALL and possible_keys=NULL on every table.
--
-- What: purely additive indexes. No column, query or result changes.
--
-- Every statement uses IF NOT EXISTS, which MariaDB 10.1.4+ supports on
-- ALTER TABLE, so re-running this file is a safe no-op.
--
-- Run:  mysql -u root sales < add_crm_indexes.sql
-- ---------------------------------------------------------------------------

-- Primary keys (id verified unique in all six tables beforehand)
ALTER TABLE global_limo_user         ADD PRIMARY KEY IF NOT EXISTS (id);
ALTER TABLE global_limo_listing      ADD PRIMARY KEY IF NOT EXISTS (id);
ALTER TABLE global_limo_listing_type ADD PRIMARY KEY IF NOT EXISTS (id);
ALTER TABLE leads                    ADD PRIMARY KEY IF NOT EXISTS (id);
ALTER TABLE phone_country_code       ADD PRIMARY KEY IF NOT EXISTS (id);
ALTER TABLE groups                   ADD PRIMARY KEY IF NOT EXISTS (id);

-- Join / lookup columns.
-- check-availability walks leads -> listing -> listing_type / user
ALTER TABLE global_limo_listing ADD INDEX IF NOT EXISTS idx_gll_listing_type (listing_type);
ALTER TABLE global_limo_listing ADD INDEX IF NOT EXISTS idx_gll_userid       (userid);
ALTER TABLE leads                ADD INDEX IF NOT EXISTS idx_leads_listing_id (listing_id);

-- WHERE type = 1 in the check-availability query resolves to leads.type
ALTER TABLE leads ADD INDEX IF NOT EXISTS idx_leads_type (type);

-- Narrow covering index for the ad-package user lookup, which matches a phone
-- with `cellnumber = ? OR cellnumber = ?` alongside a REPLACE(...) expression.
-- EXPLAIN picks this index (type=index, "Using index") instead of the clustered
-- PK, so the scan touches a much smaller structure.
--
-- NOTE: this index was originally added for the inbox per-thread phone match.
-- That SQL no longer runs - it was replaced by an in-memory match over a single
-- bulk read - so this is now only a minor win, not the 1625-row-scan fix the
-- earlier version of this comment claimed. Safe to drop if you prefer a minimal
-- schema; nothing in the inbox path depends on it any more.
ALTER TABLE global_limo_user ADD INDEX IF NOT EXISTS idx_glu_cellnumber (cellnumber);

-- check-availability latest-followup / latest-renewal aggregation
ALTER TABLE leads_followup ADD INDEX IF NOT EXISTS idx_leads_followup_lead_id  (lead_id);
ALTER TABLE listing_renews  ADD INDEX IF NOT EXISTS idx_listing_renews_listing_id (listing_id);

-- check-availability per-lead preference lookup
ALTER TABLE user_preferences ADD INDEX IF NOT EXISTS idx_up_user_id (user_id, is_deleted);