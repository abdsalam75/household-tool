# Household setup and time-zone settings

## Mobile flow

After parent authentication, the app calls `get_household_settings`. An active
parent sees the persisted household setting. A parent without a household sees
setup instead.

Setup proposes `Intl.DateTimeFormat().resolvedOptions().timeZone` only when the
mobile runtime recognizes it as a named zone. Missing, fixed-offset, and
unsupported values produce an editable `Etc/UTC` fallback with an explanation.
Nothing is submitted until the parent reviews the field and presses **Create
household**. The server remains authoritative even after client validation.

The settings screen explains that the zone controls future due-day boundaries,
reminders, and overdue calculations. It displays the persisted value and has
explicit loading, success, retryable error, and save states. A failed save does
not replace the last persisted setting.

## Server operations and authorization

All operations are authenticated RPCs. The mobile app never supplies a
household ID, account ID, role, or active flag.

- `setup_household(requested_timezone)` serializes requests by `auth.uid()`,
  returns an existing active-parent setup on retry, and otherwise creates the
  household and initial active parent membership in one database transaction.
  A new setup requires a non-anonymous parent authentication carrying the
  verified email claim used by the supported email, Google, and Apple parent
  sign-in flows. Existing child or inactive memberships cannot create.
- `get_household_settings()` derives the active parent membership and returns
  only that household. Other callers receive no protected row.
- `update_household_timezone(requested_timezone)` derives and locks the active
  parent membership before updating that household. Unauthorized callers get a
  generic error and cannot choose a target.
- `app_private.household_timezone_for_scheduling(household_id)` is executable
  only by the server `service_role`. It reads the current persisted zone used
  as the input to later due-date, reminder, and overdue scheduling code.

The database accepts a non-empty identifier present in PostgreSQL's
`pg_timezone_names()` and rejects offset strings such as `+01:00`. Store event
timestamps separately in UTC; never replace the household setting with its
current UTC offset. `America/New_York`, for example, must remain named so later
scheduling observes daylight-saving transitions.

## Verification

Run from Ubuntu/WSL with Linux Node.js and npm:

```sh
command -v node
command -v npm
npm run typecheck
npm run format:check
npm run lint
npm test
```

Run the focused disposable database integration check after creating the local
Supabase environment. The script deletes only the explicitly named disposable
Compose project's volumes and removes them on exit:

```sh
./scripts/create-supabase-env.sh # only if infra/supabase/.env is absent
docker compose --env-file infra/supabase/.env -f infra/supabase/docker-compose.yml -f infra/supabase/docker-compose.caddy.yml down
COMPOSE_PROJECT_NAME=household-foundation-check ./scripts/test-household-database.sh
```

The database test covers atomic setup, retries, invalid zones, active parent,
child, inactive member, non-member, anonymous, and cross-household access. It
also proves a failed update preserves the old value and the scheduling helper
reads the changed `America/New_York` value.
