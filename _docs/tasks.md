# Shared Household Chores — MVP Backlog

## 1. Create the empty mobile project and a passing test
Goal: Establish a runnable React Native and TypeScript project with one passing automated test.
Description: Create the empty project using Expo development builds, TypeScript, and the selected test runner. Add one minimal passing test and document the command that runs it; do not implement product screens or backend behavior.

## 2. Configure project quality checks
Goal: Make type-checking, formatting, linting, and tests repeatable.
Description: Configure project scripts for TypeScript checking, formatting, linting, and tests. Add concise contributor instructions so a developer can validate work locally from a clean checkout.

## 3. Create and document the Docker Compose backend environment
Goal: Provide a safe local and production-oriented Compose foundation for self-hosted Supabase.
Description: Add a local Compose configuration based on Supabase's official self-hosted topology, health checks, and a non-secret environment template. Document production service boundaries, persistent volumes, reverse proxy/TLS, pinned images, backups, firewall rules, secrets, and deployment order; do not deploy infrastructure.

## 4. Configure versioned database migrations
Goal: Make Postgres schema changes repeatable and reviewable.
Description: Configure the migration workflow for the Compose environment and prove a placeholder migration can be applied to a clean stack. Document migration commands and ensure manual database edits are not the source of truth.

## 5. Create household, membership, and access-control foundations
Goal: Persist household membership and prevent cross-household access.
Description: Add households and members migrations with IANA time zone, parent/child role, active state, constraints, and timestamps. Add and test RLS policies using at least two households, proving parents receive permitted household access and children receive only the minimum member visibility required.

## 6. Configure parent authentication providers
Goal: Enable parent email, Google, and Apple sign-in through self-hosted Supabase Auth.
Description: Configure authentication, redirect URLs, and non-secret environment placeholders for email, Google OAuth, and Apple OAuth. Document required provider-console settings and validate configuration using non-production credentials; no mobile screens are included.

## 7. Build parent sign-in and session handling
Goal: Let a parent establish and retain an authenticated mobile session.
Description: Build email sign-in plus Google and Apple entry points, with loading and error states. Securely persist the successful session and route to an authenticated placeholder, without implementing household setup.

## 8. Build household setup and time-zone settings
Goal: Let a parent create a household and later change its time zone.
Description: Build the initial household-creation flow using the device's detected IANA time zone as a proposed default. Add a parent-only settings operation and screen to update it, clearly explaining that future reminder and overdue calculations use the changed zone; test that children and non-members are rejected.

## 9. Implement parent invitations with QR sharing
Goal: Let a parent create, display, share, and revoke a secure 24-hour parent invitation.
Description: Add the invite schema and parent-only server operations for a high-entropy opaque, single-use parent invite with expiration and revocation. Build the QR/share screen with expiry and error states, encoding only the invitation URL—not household IDs or credentials.

## 10. Implement parent invitation acceptance
Goal: Let an authenticated parent join a household exactly once with a valid invitation.
Description: Build the deep-link/mobile and backend flow that validates, atomically consumes, and joins a parent invitation. Clearly handle expired, revoked, used, and wrong-role links, then grant the joining parent equal parent permissions.

## 11. Configure invitation deep links
Goal: Route valid household invitation URLs into the installed app on iOS and Android.
Description: Configure Universal Links and Android App Links, including required association files and app configuration. Verify test URLs enter the appropriate in-app acceptance flow and provide a safe browser fallback when the app is unavailable.

## 12. Build child profile administration
Goal: Let parents manage child profiles before and after sign-in is activated.
Description: Build parent-only operations and a simple screen to create, list, deactivate, and reset access for child display names. Do not implement child authentication in this task.

## 13. Implement child invitations with QR sharing
Goal: Let a parent create and present a secure 24-hour invitation for one child profile.
Description: Add child-role invitation operations tied to an intended child profile, with parent-only creation, expiration, revocation, and single-use validation. Build its QR/share UI, identifying the intended child without putting authentication data in the QR payload.

## 14. Implement child invite acceptance and PIN setup
Goal: Let a child activate an invited profile using a simple PIN.
Description: Build the deep-link flow and protected server operation that validates and consumes a child invite, verifies the intended profile, and sets the child PIN. Hash PINs server-side, rate-limit attempts, never log them, and handle invalid or expired invitations clearly.

## 15. Implement child PIN sign-in
Goal: Let an activated child authenticate without email or phone number.
Description: Build the child sign-in screen and server credential flow, including rate limits, secure session storage, and error handling. Test invalid PINs, inactive children, and attempts to use a child identity from another household.

## 16. Build device registration and notification-permission onboarding
Goal: Register a member's push-capable device after explaining why notifications matter.
Description: Add the device-installations schema/API for token, platform, permission state, refresh, and invalidation. Build reusable onboarding copy and the native permission prompt, persist the result, and provide a useful declined-permission path without exposing tokens to other users.

## 17. Configure and verify native notification actions
Goal: Make an isolated **Complete** action available in notifications on iOS and Android.
Description: Configure Expo development builds and notification categories/actions, then add a minimal test/demo notification path. Verify category registration on physical devices, but do not attach the action to chore data yet.

## 18. Create chore, occurrence, and photo schema with authorization
Goal: Establish secure storage for one-time/recurring chores, dated work, and up to three photos.
Description: Add migrations for chore definitions, dated occurrences, ordered photo metadata, and required constraints such as household-consistent child assignment and a three-photo maximum. Add RLS tests so parents manage all household chores while children can read only their assigned chores and photos.

## 19. Implement private reference-photo storage
Goal: Let authorized parents attach and retrieve secure chore reference photos.
Description: Configure private storage paths and authorized upload/download operations with limits for count, file type, size, and ownership. Use non-guessable paths and signed/authorized retrieval so photos are not public.

## 20. Build one-time chore creation
Goal: Let a parent assign one chore due today through 30 days ahead.
Description: Build the parent form for title, child, household-local due day, instructions, and optional photos. Validate the date range and create the initial actionable occurrence; recurring scheduling is excluded.

## 21. Build one-time chore editing and deletion
Goal: Let a parent safely change or remove a future one-time chore.
Description: Add parent-only editing/deletion operations and screens for one-time chores. Preserve a safe audit state for chores already actioned or notified, and reject recurring chore edits in this workflow.

## 22. Build recurring chore creation
Goal: Let a parent create immutable daily, weekly, or selected-weekday chore series.
Description: Add the recurring parent form and validate schedule data, child, title, instructions, and photos. Persist the immutable definition and create the initial scheduling state, without offering recurring edits.

## 23. Implement recurring occurrence generation
Goal: Generate exactly one dated occurrence for every scheduled household-local recurrence.
Description: Implement an idempotent server operation with unique occurrence keys, covering daily, weekly, selected weekdays, stopped series, and time-zone/DST behavior. Add focused automated tests and support the agreed planning horizon.

## 24. Implement stopping a recurring chore
Goal: Let either parent stop all future work from one recurring chore series.
Description: Add the parent-only stop operation and screen, preventing future generation while preserving past occurrences and history. Explicitly reject recurrence edits and direct parents to stop and replace the chore.

## 25. Implement occurrence lifecycle and audit history
Goal: Enforce assigned, completed, skipped, and overdue transitions with an audit trail.
Description: Add status fields and append-only events containing actor, time, action ID, and optional skip reason. Enforce valid transitions and idempotency so concurrent/retried actions cannot create duplicate statuses or events.

## 26. Build the child chore dashboard
Goal: Show each child only their own current and recently actioned chores.
Description: Build scoped queries and a mobile dashboard for due, completed, skipped, and overdue occurrences. Include due-day context and loading, empty, error, and offline-cache states without exposing other members' information.

## 27. Implement in-app completion and skip flows
Goal: Let a child complete a chore or skip it with a required reason.
Description: Build authorized idempotent completion and skip mutations plus child-dashboard controls. Reconcile optimistic UI with the server result, require a selected reason for skips, and test duplicate taps, stale records, and unauthorized attempts.

## 28. Implement lock-screen chore completion
Goal: Complete a child's own chore from the native notification action without navigating into the app.
Description: Connect the **Complete** action to the authenticated idempotent occurrence API using occurrence and action IDs. Test foreground, background, terminated, and locked-device behavior on physical iOS and Android devices, including delayed retries.

## 29. Build the parent current-progress dashboard
Goal: Let either parent see household chores due today and overdue.
Description: Build parent-only queries and a read-only dashboard grouping current occurrences by today and overdue. Include the assigned child, title, status, and due-day context.

## 30. Build the parent 15-day history view
Goal: Let either parent review recent completed and skipped chores.
Description: Build a parent-only paginated/time-windowed view showing child, chore, event time, and skip reason when applicable. Restrict it to the MVP's 15-day retained history window.

## 31. Build notification-delivery tracking and assignment pushes
Goal: Record notification attempts and immediately notify children of newly assigned chores.
Description: Add notification-delivery records with recipient, occurrence, type, intended time, provider result, and retry state. Connect new occurrence creation to direct FCM/APNs delivery for active child devices, using durable idempotency keys to avoid duplicate sends.

## 32. Implement the 5:00 PM reminder worker
Goal: Send each open chore's child an actionable reminder at 5:00 PM household-local time.
Description: Add the Compose worker job that finds eligible due-today occurrences and records/sends actionable reminder deliveries. Use database locking and idempotency, and test multiple time zones, daylight-saving boundaries, and retries.

## 33. Implement completion and skip parent notifications
Goal: Notify both parents whenever a child completes or skips a chore.
Description: Create delivery records from successful terminal transitions and send the correct message to all active parent devices. Include skip reasons only in a privacy-conscious form and prove duplicate child actions yield one logical parent notification.

## 34. Implement the midnight overdue worker and notifications
Goal: Mark unresolved chores overdue after the household-local due day and notify the household.
Description: Add the Compose worker job that atomically transitions eligible occurrences and notifies the assigned child and both parents. Test terminal-state exclusions, delayed job execution, time-zone transitions, and retry idempotency.

## 35. Implement 15-day retention cleanup
Goal: Remove expired MVP history without affecting current chores.
Description: Add an auditable scheduled cleanup for old history and related notification records according to an explicit retention rule. Test its household-time-zone cutoff and prove it preserves active definitions, current occurrences, and newer events.

## 36. Add operational health, logging, backups, and restore verification
Goal: Make the self-hosted backend observable and recoverable.
Description: Add health/readiness checks, structured redacted logs, and operator guidance for failed jobs. Implement or document encrypted off-host database/storage backups and a restore verification into an isolated environment, without using production data in routine tests.

## 37. Add end-to-end authorization coverage
Goal: Prove users cannot access data outside their authorized scope.
Description: Create end-to-end tests with multiple households, parents, and children covering APIs and RLS for chores, photos, history, invitations, and device registration. Test direct API attempts as well as normal UI-driven paths.

## 38. Run physical-device notification acceptance testing
Goal: Verify the core reminder and lock-screen completion workflow on real iOS and Android devices.
Description: Create and execute a repeatable checklist covering permission prompts, assignment pushes, 5:00 PM reminders, locked-screen Complete, Skip opening the app, parent notifications, and overdue notifications. Record platform constraints and defects without adding unrelated features.

## 39. Prepare release candidates and release checklist
Goal: Produce internal-test builds and a clear go/no-go checklist without publishing production releases.
Description: Configure release identifiers, icons, permission rationale, deep links, privacy metadata, build profiles, and staging environment variables, then build internal-test candidates. Document final checks for migrations, backups, secrets, OAuth, TLS, push credentials, store assets, acceptance tests, rollback ownership, and production promotion.
