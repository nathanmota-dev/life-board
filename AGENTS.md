# Life Board

Life Board is a personal Electron desktop app for organizing and tracking everything in day-to-day life in one place. Its goal is to work as a personal control board, covering:

- Tasks: to-dos and personal projects.
- Calendar: events, appointments, and scheduling.
- Goals: short- and long-term goals and their progress.
- GitHub: issues and pull requests to follow up on.
- Habits and routines: recurring personal tracking such as drinking water, cleaning the house, and similar chores or habits.

## Technology stack

- Desktop shell: Electron, built with electron-vite.
- Frontend: Vite, React, Tailwind CSS, shadcn/ui components, and TanStack Router.
- Backend (`api/`): Node, Fastify, Drizzle ORM with SQLite (`@libsql/client`) and Zod, organized as DTOs, controllers and services. It runs inside Electron's `utilityProcess` and listens on 127.0.0.1.
- Tests: Vitest, with jsdom and Testing Library for frontend tests. The backend requires at least 80% coverage.

## Agent instructions

When a task requires creating a Git branch, commit, or pull request, follow the `git-pr-conventions` skill at `.agents/skills/git-pr-conventions/SKILL.md`.
