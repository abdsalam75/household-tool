# Household Tool

React Native + TypeScript mobile application for shared household chores. The
project uses Expo development builds, so native integrations can be exercised
outside Expo Go.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm

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
