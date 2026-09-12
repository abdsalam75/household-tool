# Shared Household Chores — Architecture

## Purpose

This document records the technical architecture selected for the Shared
Household Chores MVP described in [plan.md](plan.md). It is intentionally
specific enough to guide implementation, while leaving visual design and API
details to the implementation phase.

## Chosen stack

| Area | Choice | Reason |
| --- | --- | --- |
| Mobile application | React Native with TypeScript | One codebase for iPhone and Android, with a broadly available TypeScript ecosystem. |
| Native integration | Expo development builds | Keeps the React Native workflow productive while allowing the native configuration required for push notifications and notification actions. Expo Go is not sufficient for validating the production notification workflow. |
| Data and backend | Self-hosted Supabase Postgres, deployed with Docker Compose | Retains a relational model and row-level security while satisfying the self-hosted deployment requirement. |
| Authentication | Self-hosted Supabase Auth plus server-managed child PIN accounts | Supports parent email, Google, and Apple sign-in while allowing children to join without email or phone numbers. |
| Files | Self-hosted Supabase Storage | Stores the optional reference photos, with database metadata and access rules tied to each household. |
| Server logic | Self-hosted Supabase Edge Functions | Handles privileged work: invites, child authentication, notification dispatch, status transitions, and photo access operations where appropriate. |
| Scheduled processing | A dedicated Compose worker service invoking Edge Functions/database procedures | Creates/sends due reminders, marks chores overdue, sends overdue notifications, and removes expired history. It is independent of any device being online. |
| Push transport | Firebase Cloud Messaging (FCM) with Apple Push Notification service (APNs) credentials | Provides Android delivery and routes Apple notifications through APNs. The app registers each device token with the backend. |
| Links and invitations | iOS Universal Links and Android App Links | Opens an installed app from a secure QR/link invitation, with a browser fallback when it is not installed. |
| Observability | Structured server logs and a mobile crash-reporting service | Makes notification failures, invitation issues, and background-job failures diagnosable before operating at scale. The exact crash-reporting provider remains an implementation choice. |

## Technology review (September 2026)

Each original stack decision was checked against current, production-capable
alternatives. The selected stack remains the recommended MVP choice; this is a
review, not a claim that the chosen tools are the only valid tools.

| Concern | Current viable alternatives reviewed | Decision |
| --- | --- | --- |
| Cross-platform mobile UI | Flutter; Kotlin Multiplatform with Compose Multiplatform; separate Swift/Kotlin apps | Keep React Native + TypeScript. Kotlin Multiplatform and Compose for iOS/Android are now stable, but add a Kotlin/Gradle/Xcode toolchain and do not remove the need for platform-specific notification testing. React Native has the lower implementation cost for this TypeScript-first MVP. |
| Native bridge/runtime | Bare React Native; Expo development builds | Keep Expo development builds. They support custom native modules and interactive notification categories, unlike relying solely on Expo Go. |
| Backend/data | Managed Supabase; Firebase; Appwrite; a custom TypeScript API plus Postgres | Keep Supabase but self-host it. Its Postgres/RLS model matches household authorization and recurrence better than a document-first model, while Docker Compose provides the required deployment model. |
| Server execution | A standalone Node/TypeScript API and worker; Supabase Edge Functions | Keep Edge Functions for authenticated business operations and add a dedicated worker container for durable scheduled work. This separates request handling from recurring jobs. |
| Authentication | Firebase Auth; Auth0; Keycloak; bespoke credentials | Keep Supabase Auth for parents, with the constrained custom child-PIN server flow. A separate identity server would increase the Compose footprint without solving child PIN requirements by itself. |
| Object storage | S3-compatible MinIO; managed object storage | Keep Supabase Storage initially because it integrates with the selected auth and policies. Move to an external S3-compatible store only if storage scale or backup policy requires it. |
| Push delivery | Expo Push Service; direct FCM/APNs; third-party engagement platforms | Use direct FCM/APNs from the worker/Edge Functions. This keeps notification credentials and delivery data under project control, and supports the native action requirements. |
| Reverse proxy/TLS | Caddy; Traefik; Nginx | Use Caddy in Compose for automatic TLS and a small, explicit public surface. Traefik remains a viable alternative if future deployments need richer multi-service routing. |
| Monitoring | Self-hosted Grafana/Prometheus/Loki; managed error monitoring | Start with structured container logs, health checks, and a hosted mobile crash reporter. Add the self-hosted observability stack only when operational volume justifies it. |

Current platform support confirms that React Native's New Architecture remains
the mainstream direction, Expo development builds support custom native work,
and interactive notification categories are available through Expo's
notification APIs. Kotlin Multiplatform and Compose Multiplatform are also now
stable for Android and iOS, so they are a credible future alternative rather
than an immature option. Sources: [React Native architecture](https://reactnative.dev/architecture/overview), [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), and [Kotlin Multiplatform stability](https://kotlinlang.org/docs/multiplatform/supported-platforms.html).

Supabase officially supports self-hosting with Docker Compose, but this changes
the team from a managed-service customer into the operator responsible for
patching, backups, monitoring, and recovery. [Supabase self-hosting documentation](https://supabase.com/docs/guides/self-hosting)

## System boundary

```
React Native app (parent or child)
       |                  \\
       | authenticated API  \\ push interaction
       v                    v
Supabase: Auth, Postgres, Storage, Edge Functions  <--->  FCM / APNs
       ^                    |
       |                    | scheduled server invocation
       +--------------------+
```

The mobile app reads permitted data and performs normal user actions. All
time-sensitive and privileged decisions happen server-side. In particular, the
server owns occurrence generation, notification scheduling, overdue changes,
invite validation, and retention cleanup.

## Roles and access model

### Parents / admins

- A household has exactly two equivalent admin-capable parent members in the
  MVP once the second parent joins; initially it may have one.
- Parents may manage household settings, invites, children, and all chores.
- Parents can view all current chores and the household's recent completion and
  skip history.
- Parent identity uses a normal Supabase Auth account through email, Google, or
  Apple.

### Children

- Each child has an individual application account/profile, not merely a
  parent-managed record.
- A child signs in with the name established by the parent and a simple PIN.
- The PIN is never stored in plaintext. A dedicated server-side authentication
  flow hashes, rate-limits, and verifies it, then issues an appropriately
  scoped authenticated session.
- Children may read only their own assigned occurrences and history, and may
  complete or skip only their own assigned occurrences.
- A child cannot discover names, chores, or statuses belonging to another
  household member.

### Authorization

Postgres row-level security (RLS) is the default enforcement layer. Policies
derive access from the authenticated account's membership and role rather than
from client-supplied household IDs. Edge Functions additionally verify the
caller and membership before executing privileged actions. Service-role
credentials are server-only and never embedded in the mobile application.

## Core data model

The final schema may use different names, but it must preserve these
relationships and invariants.

| Entity | Essential fields and purpose |
| --- | --- |
| `households` | ID, name if introduced, IANA time-zone identifier, creator, timestamps. The time zone is a household-wide setting. |
| `members` | Household ID, account ID, role (`parent` or `child`), display name, active status, timestamps. |
| `device_installations` | Member ID, device/platform, push token, notification permission state, last-seen time, invalidation state. A member can have multiple devices. |
| `invites` | Household ID, intended role/member information, opaque random token digest, expiration, used/revoked state, creator. Parent and child invites expire after 24 hours. |
| `chore_definitions` | Household ID, creator, title, instructions, assignee child, schedule type, schedule data, start/end state, timestamps. Defines a one-time or recurring series. |
| `chore_occurrences` | Definition ID, assignee, household-local due date, lifecycle status, completion/skip details, timestamps, and a unique occurrence key. This is the actionable record shown in dashboards. |
| `chore_photos` | Chore definition ID, ordered position (maximum three), storage object reference, upload metadata. |
| `status_events` | Occurrence ID, type, actor, optional skip reason, event time. Preserves a concise audit trail for the 15-day history. |
| `notification_deliveries` | Occurrence/member, notification type, intended send time, send attempt/result, provider message ID where available. Supports retrying and diagnosing scheduled work. |

### Chore definitions versus occurrences

A recurring chore is stored as one immutable definition plus generated dated
occurrences. Stopping a recurring chore closes the definition to future
generation; it never removes past occurrences or history. This directly
supports the MVP rule that recurring chores cannot be edited and must be
replaced to change them.

A one-time chore has one occurrence and may be edited or deleted by a parent.
Deletion should be a controlled state change rather than a hard delete when an
audit record or notification delivery already exists.

### Lifecycle

An occurrence begins `assigned`, becomes visible as due on its household-local
due day, and can become `completed`, `skipped`, or `overdue`. Completion and
skip are terminal for the MVP. The overdue job marks an unresolved occurrence
overdue after the due date ends at midnight in the household time zone.

State changes are atomic and idempotent. Every completion request carries an
occurrence identifier and a client action ID; retries, duplicate action taps,
or delayed delivery must not produce duplicate events or parent notifications.

## Time-zone and scheduling rules

- Store the household time zone as an IANA identifier, such as
  `Africa/Lagos`, rather than a fixed UTC offset.
- Store event timestamps in UTC and calculate due dates/reminder instants from
  the household zone.
- A recurring schedule uses household-local calendar dates and weekdays, so it
  remains correct through daylight-saving changes.
- The server scheduler sends the due-day reminder at 5:00 PM in the household
  zone and transitions still-open occurrences to overdue immediately after the
  local day ends.
- Scheduler work must use a durable idempotency key such as occurrence ID plus
  notification type. A delayed or retried job must not spam users.
- Changing a household time zone affects future due-boundary and reminder
  calculations. Existing event timestamps remain historically accurate.

## Notifications

### Notification events

| Trigger | Recipient | Action |
| --- | --- | --- |
| Chore assigned | Assigned child | Immediate push. |
| Due-day reminder, 5:00 PM | Assigned child | Push with a **Complete** notification action. |
| Chore completed | Both parents | Immediate informational push. |
| Chore skipped | Both parents | Immediate push including the selected reason when suitable for notification preview. |
| Due day ends while unresolved | Child and both parents | Overdue push. |

### Actionable completion

The app defines a native notification category/action for **Complete** on both
platforms. The action sends an authenticated, idempotent request to the
backend. The request must validate that the acting child owns the occurrence;
the notification payload alone is not trusted authorization.

The exact background behavior differs between iOS and Android. Therefore, the
implementation must test the action on physical locked devices, with the app
foregrounded, backgrounded, and terminated. If a platform requires the app to
briefly launch to submit the action, the user should still not have to navigate
into the app or see a chore detail screen.

**Skip** deliberately opens the app, where the child selects a reason. The
reason is then saved and parent notifications are dispatched.

### Delivery and permission handling

- Explain the notification value during onboarding, then request platform
  notification permission at that point.
- Register and refresh device tokens after authentication and whenever the
  platform token changes.
- Do not treat a push provider's acceptance as proof that a person saw the
  notification. Persist provider send results separately from business state.
- The application remains correct if permission is declined or delivery is
  delayed: the dashboard is the source of truth and the scheduler still applies
  status changes.

## Invitations and QR codes

- An invite contains a high-entropy, opaque token; the database stores only a
  digest of that token where feasible.
- A signed link resolves to a server-side invite record, validates expiration,
  household, intended role, and unused/revoked status, then consumes it exactly
  once on successful joining.
- QR codes encode the invitation link, not household IDs, account secrets, or
  child PINs.
- Parent joining uses the selected parent authentication method. Child joining
  sets the child profile name and PIN through the protected server flow.
- Invite links must use Universal Links/App Links and have a clear expired-link
  experience.

## Photos

- Each chore permits zero to three images.
- Store original objects in a private bucket using non-guessable paths scoped
  to household/chore IDs.
- RLS and/or short-lived signed URLs allow only authorized household members to
  retrieve a photo; a child may receive only photos for their own chores.
- Validate file type, byte size, and image dimensions before accepting uploads.
- A future implementation may generate thumbnails, but that is not required for
  the MVP architecture.

## Security and privacy requirements

- Require TLS for all application, link, and provider traffic.
- Enforce RLS on every table exposed through Supabase; test policies with parent
  and child accounts from multiple households.
- Keep secrets, APNs credentials, FCM credentials, Supabase service keys, and
  signing keys only in managed server configuration.
- Hash child PINs with a modern password hashing algorithm and rate-limit PIN
  attempts by account and device/IP context. Provide an admin reset flow rather
  than PIN recovery.
- Minimize personal data: children do not need email address or phone number.
- Retain operational logs only as long as necessary and avoid placing child
  names, PINs, or unnecessary chore details in logs or push payloads.
- Retain product history for 15 days as required by the MVP; define an explicit
  scheduled deletion/anonymization policy for older history and related
  notification records.

## API and client-state principles

- The database/backend is authoritative. Client-side optimistic updates may
  improve responsiveness but must reconcile with the returned occurrence state.
- Mutations use authenticated APIs and server-side authorization. The client
  never directly grants itself a role or changes another member's chore.
- List endpoints/query policies are scoped by membership and role, preventing
  cross-household enumeration.
- Use cursor/time-window pagination for history even though MVP retention is
  short.
- The app should cache the child dashboard for usable offline viewing, but
  updates requiring a server confirmation are shown as pending until confirmed.

## Deployment environments

### Docker Compose deployment

The backend is deployed on a Linux host with a production-specific Docker
Compose configuration. The mobile application is not a Compose service: it is
signed and delivered through the Apple App Store and Google Play. Compose
deploys the API, database, storage, job, and routing services it uses.

| Compose service/group | Responsibility | Exposure/persistence |
| --- | --- | --- |
| `caddy` | TLS termination, HTTP-to-HTTPS redirect, routing only the public API/auth/storage endpoints | The only public ports are 80 and 443. Configuration and certificate data are persistent. |
| Supabase gateway/API/auth/realtime/functions | Official self-hosted Supabase services for authenticated API, social login callbacks, realtime updates, and Edge Functions | Private Compose network; exposed only through Caddy. Pin compatible upstream image versions. |
| `postgres` | Primary relational database and RLS enforcement | Private network and persistent encrypted volume; never expose its port publicly. |
| storage service | Private chore-photo storage and metadata | Private network and persistent volume or an explicitly configured external S3-compatible bucket. |
| `worker` | Durable scheduler loop for due reminders, overdue transitions, retention cleanup, and push delivery retries | Private network. Its jobs use database-backed idempotency/locking so replicas cannot duplicate work. |
| optional `studio` | Administrative Supabase UI | Disabled by default in production or reachable only through a private VPN/admin network. |

Use the official self-hosted Supabase Compose configuration as the base rather
than the Supabase CLI's local development stack. The official documentation
explicitly distinguishes the local stack from a hardened self-hosted deployment.

Compose requirements:

- Pin every image to a tested release; do not deploy floating `latest` tags.
- Store production secrets in a host-level secret manager or protected
  environment files outside version control. Rotate JWT, database, APNs, FCM,
  and OAuth client secrets by a rehearsed procedure.
- Use named volumes or managed block storage for Postgres, storage data, and
  Caddy certificates. A container recreation must not lose data.
- Perform encrypted, off-host Postgres backups and storage backups. Regularly
  restore into an isolated environment to verify them.
- Define health checks and make Caddy depend on healthy internal services.
- Apply OS, Docker, and image-security updates on a scheduled maintenance
  cadence; self-hosted Supabase does not provide managed patching or point in
  time recovery.
- Restrict host firewall access to SSH administration and ports 80/443. Use a
  VPN or equivalent access control for administrative interfaces.
- Run migrations as a deliberate, versioned deployment step before application
  containers that rely on them are promoted.

### Environment separation

Maintain isolated development, staging, and production Compose deployments,
with separate domains, databases, storage, OAuth applications, mobile app
identifiers, APNs keys, and FCM projects/credentials. Test invitation links,
social-login redirects, database migrations, and notification actions against
staging before production release. Production builds require real iOS and
Android devices for end-to-end notification validation.

## Testing strategy

| Layer | Primary checks |
| --- | --- |
| Unit | Date/time-zone calculations, recurrence generation, lifecycle transition rules, idempotency behavior, invite expiration, and PIN validation. |
| Database/RLS | Parent and child permissions across at least two households; direct queries must not bypass ownership. |
| Edge Functions and worker | Auth checks, scheduled-job retries, push payload construction, storage authorization, and 15-day cleanup. |
| Mobile integration | Login, invitation, chore list isolation, photo viewing, notification permission, and foreground/background action handling. |
| Physical-device acceptance | iPhone and Android locked-screen Complete action, Skip opening the app, push delivery, 5 PM reminder, and midnight overdue behavior in representative time zones. |

## Explicit non-goals for this architecture

The architecture must not prematurely implement automatic rotation, bulk chore
creation, points/rewards/leaderboards, completion approval, proof photos,
individual recurring-occurrence editing, chat/activity feeds, advanced
analytics, per-chore reminder times, or a parent web dashboard. The relational
model leaves room for these later, but MVP screens and server jobs should only
support the product scope in [plan.md](plan.md).

## Decisions deferred to implementation

- Component/navigation and state-management libraries within React Native.
- The specific crash-reporting and product-analytics providers.
- Exact Edge Function scheduler mechanism and retry/alert thresholds.
- Maximum photo size and supported formats.
- Child PIN length, attempt limits, reset experience, and session duration.
- Parent account recovery and household transfer behavior.
- Detailed notification wording, notification-channel settings, and privacy
  behavior on lock-screen previews.

## Primary implementation risks

1. Actionable lock-screen notifications behave differently across iOS and
   Android; validate on real devices before treating the feature as complete.
2. Child PIN authentication is a custom security-sensitive flow and needs
   deliberate server-side controls rather than a client-only shortcut.
3. Time-zone boundaries and recurrence require deterministic server tests,
   especially around daylight-saving transitions.
4. Push notifications are not guaranteed delivery, so all business state must
   remain correct without them.
