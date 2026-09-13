## Goal

One or two sentences on what should be true when this is done.

## Acceptance criteria

- [ ] A statement you can check by looking at the result
- [ ] One line per case, including the awkward ones

## Out of scope

- Something that does not belong in this task, moved to #TASK-NUMBER

## Constraints

- Files this should stay inside
- Libraries to use
- Guidelines to follow

## Prerequisites / environment preflight

The orchestrator completes and records this section after the issue is selected
and before the PM, engineer, or QA is spawned. It reads this issue and every
linked document before recording it. List only what this issue needs now; tools
needed by a later issue belong in that later issue’s preflight.

| Requirement | Required now or later | Safe availability check | Setup / official documentation | Evidence or blocker |
| --- | --- | --- | --- | --- |
| Tool, service, account, credential, device, port, or resource | Required now / Later | Exact non-mutating command or inspection | Exact user-run steps and official link, if missing | Version/output, user-supplied state, or blocker |

- Include command/tool versions, accounts and credentials, hardware or test
  devices, ports, CPU/RAM/disk, and OS capabilities where applicable.
- Check availability without changing host or external state first. Do not
  install host/system tools, create external accounts, or generate/request
  credentials as part of the issue work; give the user exact setup and
  verification steps instead.
- The PM validates the completed preflight and may refine it for accuracy; if
  it is missing, incomplete, or has no passing evidence for a required-now
  item, the PM returns it to the orchestrator without grooming. The engineer
  and QA must re-check the items relevant to their work and attach their
  command output to their issue comments.
