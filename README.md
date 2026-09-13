# Household Tool

React Native + TypeScript mobile application for shared household chores. The
project uses Expo development builds, so native integrations can be exercised
outside Expo Go.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm

When using WSL, install and run Node.js and npm inside your Ubuntu
distribution. Do not use a Windows Node.js installation through `/mnt/c`:
it cannot reliably use a repository path in the Linux filesystem. Confirm the
tools are native to WSL before installing dependencies:

```sh
command -v node
command -v npm
node --version
npm --version
```

The first two commands should report Linux paths (for example, `/usr/bin/node`
or a path under your WSL home directory), not `/mnt/c/...`.

### Per-issue environment preflight

Before work begins on each backlog issue, the project records an issue-specific
preflight in the issue. It checks only the tools, services, accounts,
credentials, devices, ports, and resources needed for that issue now. Missing
requirements are checked safely first, then the user receives official setup
and verification instructions; the project does not automatically install
host tools, create accounts, or obtain secrets. See `_docs/process.md` and
`_docs/task-template.md` for the required evidence.

Current detected baseline (2026-09-14): Ubuntu 26.04.1 on WSL2 with systemd
running; Linux Node.js v24.21.0 and npm 11.19.0; and `git`, `gh`, `curl`, and
`openssl` available. The environment has 7.6 GiB total RAM (about 2.6 GiB
available at the check) and more than 900 GiB free Linux disk. The following
are not currently installed: Docker/Compose, Podman, nerdctl, `jq`, Java,
Android Debug Bridge (`adb`), `psql`, Supabase CLI, and EAS CLI. Those missing
tools are not global blockers: Docker and Docker Compose are the required-now
blocker for issue #3 only.

| Issue group | Required when its preflight says so | Do not install until then |
| --- | --- | --- |
| Current app baseline | Linux Node.js and npm; `git`, with the standard project checks below | Docker, Android, Supabase, EAS, or push tooling |
| Supabase Compose / issue #3 | Docker Engine or Docker Desktop integration plus Docker Compose v2; ports 80 and 443; sufficient resources | Supabase CLI, `psql`, or mobile tooling unless that same issue adds a need |
| Database or Supabase CLI work | Supabase CLI and/or `psql`, only if the issue's acceptance checks use them | Android/EAS/push tooling |
| Android development builds | Android SDK, an emulator or device, and `adb`; follow Expo's [Android setup guide](https://docs.expo.dev/workflow/android-studio-emulator/) | EAS or push credentials unless the issue requires them |
| EAS development builds or cloud builds | EAS CLI and an Expo account; follow Expo's [development-build guide](https://docs.expo.dev/develop/development-builds/introduction/) | Push-notification credentials unless required |
| Push notifications | A physical device where required, Expo/EAS configuration, and platform push credentials; follow Expo's [push notification guide](https://docs.expo.dev/push-notifications/overview/) | Unrelated backend or Android tooling |

For Expo's general local environment and device choices, use the official
[Expo environment setup guide](https://docs.expo.dev/get-started/set-up-your-environment/).
For Docker/Supabase issue #3 setup, follow `_docs/supabase-operations.md`.

## Local development

Install dependencies from a clean checkout:

```sh
npm install
```

Run the automated test suite:

```sh
npm test
```

## Validate changes

Run all checks before contributing:

```sh
npm run typecheck
npm run format:check
npm run lint
npm test
```

Use `npm run format` to apply the project's formatting rules.

Start the development-build bundler:

```sh
npm start
```

Use `npm run android` or `npm run ios` to launch a locally installed Expo
development build. This initial project intentionally has no product screens
or backend behavior.
