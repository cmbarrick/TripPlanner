\set ON_ERROR_STOP on

\echo 'Phase 0 Postgres smoke test starting...'
\echo 'This script validates schema + constraints and rolls back all writes.'

BEGIN;

DO $$
DECLARE
    missing_tables int;
    missing_trip_cols int;
    missing_day_cols int;
    missing_item_cols int;
    missing_indexes int;
    missing_fks int;
BEGIN
    SELECT COUNT(*)
    INTO missing_tables
    FROM (
        SELECT required_name
        FROM (VALUES
            ('Trips'),
            ('Days'),
            ('ItineraryItems'),
            ('Users'),
            ('Preferences'),
            ('consent_settings'),
            ('trip_members'),
            ('trip_shares'),
            ('packing_items')
        ) AS required(required_name)
        EXCEPT
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    ) missing;

    IF missing_tables > 0 THEN
        RAISE EXCEPTION 'Missing required Phase 0 tables.';
    END IF;

    SELECT COUNT(*)
    INTO missing_trip_cols
    FROM (
        SELECT required_col
        FROM (VALUES
            ('id'),
            ('ownerid'),
            ('title'),
            ('destination'),
            ('startdate'),
            ('enddate'),
            ('createdat'),
            ('updatedat'),
            ('deletedat')
        ) AS required(required_col)
        EXCEPT
        SELECT lower(column_name)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Trips'
    ) missing;

    IF missing_trip_cols > 0 THEN
        RAISE EXCEPTION 'Trips is missing expected columns.';
    END IF;

    SELECT COUNT(*)
    INTO missing_day_cols
    FROM (
        SELECT required_col
        FROM (VALUES
            ('id'),
            ('tripid'),
            ('ownerid'),
            ('daynumber'),
            ('date')
        ) AS required(required_col)
        EXCEPT
        SELECT lower(column_name)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Days'
    ) missing;

    IF missing_day_cols > 0 THEN
        RAISE EXCEPTION 'Days is missing expected columns.';
    END IF;

    SELECT COUNT(*)
    INTO missing_item_cols
    FROM (
        SELECT required_col
        FROM (VALUES
            ('id'),
            ('dayid'),
            ('ownerid'),
            ('type'),
            ('title'),
            ('sortorder')
        ) AS required(required_col)
        EXCEPT
        SELECT lower(column_name)
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ItineraryItems'
    ) missing;

    IF missing_item_cols > 0 THEN
        RAISE EXCEPTION 'ItineraryItems is missing expected columns.';
    END IF;

    SELECT COUNT(*)
    INTO missing_indexes
    FROM (
        SELECT required_idx
        FROM (VALUES
            ('IX_Trips_OwnerId'),
            ('IX_Days_TripId_DayNumber'),
            ('IX_ItineraryItems_DayId_SortOrder'),
            ('IX_trip_members_TripId_UserId'),
            ('IX_consent_settings_UserId')
        ) AS required(required_idx)
        EXCEPT
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
    ) missing;

    IF missing_indexes > 0 THEN
        RAISE EXCEPTION 'Missing one or more expected indexes.';
    END IF;

    SELECT COUNT(*)
    INTO missing_fks
    FROM (
        SELECT required_fk
        FROM (VALUES
            ('FK_Days_Trips_TripId'),
            ('FK_ItineraryItems_Days_DayId'),
            ('FK_trip_shares_Trips_TripId'),
            ('FK_trip_members_Trips_TripId')
        ) AS required(required_fk)
        EXCEPT
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'f'
    ) missing;

    IF missing_fks > 0 THEN
        RAISE EXCEPTION 'Missing one or more expected foreign keys.';
    END IF;
END $$;

DO $$
DECLARE
    trip_id uuid := ('00000000-0000-0000-0000-' || substr(md5(clock_timestamp()::text || 'trip'), 1, 12))::uuid;
    day_id uuid := ('00000000-0000-0000-0000-' || substr(md5(clock_timestamp()::text || 'day'), 1, 12))::uuid;
    item_id uuid := ('00000000-0000-0000-0000-' || substr(md5(clock_timestamp()::text || 'item'), 1, 12))::uuid;
    day_count int;
    item_count int;
BEGIN
    INSERT INTO "Trips" (
        "Id", "OwnerId", "Title", "Destination", "StartDate", "EndDate",
        "Travelers", "CoverTheme", "EstimatedCost", "Currency", "CreatedAt", "UpdatedAt"
    ) VALUES (
        trip_id, 'sql-smoke-user', 'SQL Smoke Trip', 'Test Destination',
        DATE '2026-07-01', DATE '2026-07-02',
        1, 'lisbon', 10.00, 'USD', NOW(), NOW()
    );

    INSERT INTO "Days" (
        "Id", "TripId", "OwnerId", "DayNumber", "Date", "CreatedAt", "UpdatedAt"
    ) VALUES (
        day_id, trip_id, 'sql-smoke-user', 1, DATE '2026-07-01', NOW(), NOW()
    );

    INSERT INTO "ItineraryItems" (
        "Id", "DayId", "OwnerId", "Type", "Title", "Currency", "SortOrder", "CreatedAt", "UpdatedAt"
    ) VALUES (
        item_id, day_id, 'sql-smoke-user', 3, 'SQL Smoke Activity', 'USD', 0, NOW(), NOW()
    );

    SELECT COUNT(*) INTO day_count FROM "Days" WHERE "TripId" = trip_id;
    SELECT COUNT(*) INTO item_count FROM "ItineraryItems" WHERE "DayId" = day_id;

    IF day_count <> 1 OR item_count <> 1 THEN
        RAISE EXCEPTION 'Insert sanity check failed (day_count=%, item_count=%).', day_count, item_count;
    END IF;

    DELETE FROM "Trips" WHERE "Id" = trip_id;

    SELECT COUNT(*) INTO day_count FROM "Days" WHERE "TripId" = trip_id;
    SELECT COUNT(*) INTO item_count FROM "ItineraryItems" WHERE "DayId" = day_id;

    IF day_count <> 0 OR item_count <> 0 THEN
        RAISE EXCEPTION 'Cascade delete check failed (day_count=%, item_count=%).', day_count, item_count;
    END IF;
END $$;

ROLLBACK;

\echo 'Phase 0 Postgres smoke test passed.'
