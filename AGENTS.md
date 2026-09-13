- `_docs/process.md` - how work is organized

Commands

- `npm install` - install dependencies
- `npm run typecheck` - check TypeScript types
- `npm run format:check` - check formatting
- `npm run lint` - check JavaScript and TypeScript lint rules
- `npm test` - the whole suite
- `npm test -- <test-file>` - one test file

Rules

- Dependencies are added in `package.json`. Do not add one without asking.
- Run Node.js and npm from Ubuntu/WSL, not from the Windows Node.js
  installation. `command -v node` and `command -v npm` should resolve to
  Linux paths rather than `/mnt/c/...`.
