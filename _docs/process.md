# Process

- Tasks are GitHub issues, one at a time
- Commit regularly

Roles

- PM - grooms a task before anyone implements it, follows _docs/team/pm.md
- Engineer - implements one groomed task, follows _docs/team/software-engineer.md
- QA - checks the result against the acceptance criteria, follows _docs/team/qa-engineer.md


## Orchestrator

The main session is the orchestrator. It launches the PM, the engineer and QA
as subagents. It does not groom, implement or test itself.

### Subagent execution

Codex supports subagent workflows from direct prompts and from applicable
project instructions. See the official
[Codex subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents).

- For every PM, engineer and QA step, the orchestrator must make an actual
  Codex subagent spawn call. When Codex collaboration tools are available, this
  means calling `spawn_agent`; merely saying that an agent was launched or
  displaying a waiting message is not a spawn.
- Use one dedicated agent thread per lifecycle role. PM, engineer and QA are
  dependent stages, so do not run them in parallel. Launch the next role only
  after the preceding role has returned its final result and made its required
  GitHub issue update.
- Give every spawn a unique task name and a concrete prompt in this form:
  "Spawn one ROLE subagent for GitHub issue #NUMBER. Follow ROLE_FILE. Return
  DELIVERABLE, preserve unrelated worktree changes, and do not perform the next
  lifecycle role." Include the issue's current QA or PM comment when it is
  input to that run.
- A spawn is successful only when Codex returns an agent handle or task name
  and that same agent appears in the active-agent list. Record that identifier.
  In clients that expose the standard collaboration operations, use
  `list_agents` to confirm it, `send_message` to steer a running turn,
  `followup_task` to resume an idle agent, and `wait_agent` only after a live
  agent has been confirmed.
- If the spawn call fails, returns no handle, or the requested agent never
  appears in the active-agent list, no agent was spawned. Do not call the wait
  operation and do not report that the role is running. Retry the spawn with
  the same issue context or report the launch failure.
- Before each wait, give the user a short progress update naming the issue,
  role and confirmed live task name. In the Codex CLI, `/agent` can be used to
  inspect or switch to the spawned thread; supported app and IDE clients show
  the same thread in their Active/Done agent UI.
- "No agents completed yet", a wait timeout, or an empty poll means only that
  the wait returned before a final agent result was available. Immediately
  check the recorded task name in the active-agent list. If it is still active,
  continue waiting on that same agent. If it is absent and no completed result
  exists, treat that as a missing launch or terminated run and spawn a
  replacement for the same role and issue.
- Never present a wait response or agent-status placeholder as a lifecycle
  result. Proceed only from the matching subagent's final response and its
  authoritative repository or GitHub changes.
- While a subagent is live, the orchestrator may inspect agent status or do
  other non-role coordination, but it must not duplicate that subagent's PM,
  implementation or QA work.

## Lifecycle

1. Pick the next open issue from the backlog
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the backlog is empty

### Mandatory issue preflight

After lifecycle step 1 and before lifecycle step 2, the orchestrator completes
and records a prerequisites/environment preflight on that issue. Read the
issue and every document it links before deciding what is needed. This is an
issue-specific check, not a reason to install every tool mentioned in the
roadmap. Do not spawn the PM until every required-now prerequisite has passed.

- Classify each dependency as **required now** (needed to groom, implement, or
  verify this issue) or **later** (needed only by a future issue). Do not make a
  missing later dependency a blocker for the current issue, and do not install
  future tooling merely in anticipation of it.
- Identify the required commands, tools and compatible versions, local or
  external services, accounts, credentials or secrets, devices/hardware,
  network ports, RAM, CPU, disk space, and operating-system capabilities.
- Run only safe, non-mutating availability checks first (for example
  `command -v TOOL`, `TOOL --version`, `docker version`, `docker compose
  version`, a port check, and a disk or memory check). Do not run installation,
  provisioning, destructive, or credential-generating commands as a preflight.
- For every missing required prerequisite, provide the user the official
  installation or setup link, exact user-run installation and verification
  steps, the reason it is needed for this issue, and any platform-specific
  choice. Never automatically install host or system tools, enable a system
  service, create an external account, or create/obtain credentials or secrets.
- Record the results, including commands and versions checked, in the issue's
  **Prerequisites / environment preflight** section. A required prerequisite
  passes only when its verification evidence is recorded, or when the user
  explicitly supplies the required external state.
- Do not spawn a PM, engineer, or QA agent and do not start implementation
  until every required-now prerequisite has passed. If one is unavailable,
  explain the blocker and leave the issue open for the user to complete the
  stated setup. Re-run the relevant safe checks when the user says setup is
  complete.

The current baseline and common future issue groups are documented in
`README.md`; service-specific Docker/Supabase setup is documented in
`_docs/supabase-operations.md`. The issue preflight remains authoritative,
because requirements can change by issue.

## Rules

- Do not skip the mandatory issue preflight
- The engineer does not close the issue
- QA does not fix the code, only outputs PASS or FAIL
- The orchestrator closes the issue only after QA outputs PASS
- When QA fails because the implementation misses a valid acceptance criterion,
  the orchestrator sends the QA comment and the same issue back to a new
  engineer run as described in lifecycle step 3.
- When QA or the engineer finds that the issue itself is contradictory,
  impossible, or excludes a file required by its own acceptance criteria, the
  orchestrator sends the issue back to a PM subagent for clarification before
  launching the next engineer run. The PM records the clarification on the
  issue; the orchestrator does not silently reinterpret the criteria.
