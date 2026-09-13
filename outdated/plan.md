# Shared Household Chores — MVP Scope

## Product goal

A mobile tool for a family household that removes the mental burden of parents repeatedly reminding children about chores. Parents manually assign chores, children receive actionable reminders and can mark them complete from the lock screen, and both parents can see the household's current progress.

## Target users and roles

### Parents / admins

- A household has two equal parent/admin roles. Either can create, assign, edit, stop, or remove chores and view the full household dashboard.
- One parent creates the household; the second can join through either a secure 24-hour QR/invite link or a household code.
- Parents sign in with Google, Apple, or email sign-in.

### Children

- Every child has an individual profile and signs in, so reminders, chore lists, and history belong to the correct person.
- A parent adds a child through a secure QR code or invite link that expires after 24 hours.
- The child joins with a name and simple PIN; email address and phone number are not required.
- Children see only their own chores and their own statuses, not other household members' chores.

## Platforms

- Android and iPhone from launch.
- Mobile apps only in the MVP; no web dashboard.
- The app must support native actionable notifications so a child can mark a chore complete directly from the lock screen or notification, without opening the app.

## Household setup

- The app detects the household time zone from the parent who creates it.
- Parents can change the household time zone in settings.
- The time zone determines due-day boundaries and notification times for all members.

## Chore creation and assignment

- Parents manually create and assign every chore in the MVP.
- The creation flow creates one chore at a time.
- Parents can schedule a one-time chore for today through 30 days ahead.
- Every chore has:
  - A title
  - A due day (no exact due time)
  - Optional written instructions
  - Up to three optional reference photos
- There are no priority labels in the MVP; all chores are treated equally.
- Parents can edit or delete one-time chores.

## Recurring chores

- Parents can create recurring chores that repeat daily, weekly, or on selected days of the week.
- Recurring chores cannot be edited after creation in the MVP.
- A parent can stop a recurring chore, which stops every future occurrence.
- To change a recurring chore, the parent stops it and creates a replacement.

## Chore lifecycle and statuses

1. **Assigned:** A parent assigns the chore. The child gets an immediate push notification.
2. **Due today:** The chore appears in the child's list and receives a 5:00 PM reminder on its due day.
3. **Completed:** The child marks it complete in the app or directly from an actionable lock-screen notification. No parent approval is required.
4. **Skipped:** The child may skip a chore, selects a reason, and both parents are notified. Skipped is distinct from completed in history.
5. **Overdue:** If it remains incomplete after the due day ends at midnight in the household time zone, it stays visible as overdue. The child and both parents receive an overdue notification.

## Notifications

- Child receives an immediate push notification when a chore is assigned.
- Child receives a reminder at 5:00 PM on the due day.
- The reminder supports a direct **Complete** action from the lock screen/notification.
- Choosing **Skip** opens the app so the child can select a reason; both parents are then notified.
- Both parents receive a push notification every time a child completes a chore.
- Both parents and the child receive an overdue notification for unfinished chores.
- During onboarding, the app clearly explains why notifications are needed and requests notification permission.

## Dashboards and history

### Parent dashboard

- Today's chores
- Overdue chores
- Recent completion and skipped-chore history
- History is retained for 15 days.

### Child dashboard

- The child's assigned chores only
- Clear statuses for due, completed, skipped, and overdue chores

## Explicitly excluded from the MVP

- Automatic chore assignment and rotation
- Quick multi-chore / bulk creation
- Points, leaderboards, and custom parent-defined rewards
- Chore approval or proof-of-completion photos
- Editing individual occurrences of recurring chores
- Parent web dashboard
- Chat, comments, likes, or a family activity feed
- Advanced reports and analytics
- Per-chore reminder times

## Planned later enhancements

1. Automatically rotate recurring chores among eligible children.
2. Create and assign several chores in one flow.
3. Add points for completed chores.
4. Add household leaderboards.
5. Allow parents to define rewards redeemable with points.
6. Allow richer recurring-chore editing, including changing only one occurrence or all future occurrences.
7. Consider a parent web dashboard and more detailed trends/reports after the mobile workflow proves useful.

## Product decisions made during scope-setting

| Decision | Why it fits the MVP | Alternative considered |
| --- | --- | --- |
| Manual assignment first | Gives parents full control and avoids fairness/rotation logic before real usage patterns are known. | Automatic rotation from launch |
| No completion approval | Keeps completion frictionless and supports lock-screen completion. | Parent approval or proof photos |
| Due day, not due time | Parents can create chores quickly without excessive setup. | Exact deadlines for each chore |
| 5:00 PM reminder | A predictable household default reduces configuration burden. | Per-chore reminder times |
| Overdue at midnight | Clearly separates a reminder from a missed chore without asking parents to choose every deadline time. | Becoming overdue at 5:00 PM |
| Individual child profiles | Enables accurate assignments, notifications, and histories. | Parent-managed child profiles only |
| QR/link onboarding | Makes joining easy without requiring children to have email or phone numbers. | Email/phone invitations only |
| Equal parent/admin roles | Fits a shared household-management model. | One owner with special permissions |
| 15-day history | Provides recent accountability while keeping the first version focused. | Permanent history or long-term reports |
| No rewards initially | Validates the core habit before adding incentive mechanics. | Points and leaderboards from launch |

## MVP success test

The MVP succeeds if a parent can assign a chore in under a minute, the child receives a useful reminder and completes it without opening the app, and both parents can immediately tell what is due, completed, skipped, or overdue.
