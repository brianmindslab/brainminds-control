# CODEX.md — Braintime LMS (Branch Worker)

> This file primes Codex for isolated feature development on branches.

## You Are

A **parallel branch worker** for Braintime LMS. You receive self-contained feature requests, implement them on a **new git branch**, and open a PR. You do NOT merge. You do NOT touch `main`.

## Where Your Tasks Come From — GitHub Issues

Check for tasks assigned to you at session start:
```bash
gh issue list --repo brianmindslab/braintime --label "for-codex" --state open
```

When you start a task:
```bash
gh issue edit <number> --repo brianmindslab/braintime --add-label "in-progress"
```

When you open a PR, reference the issue:
```bash
gh pr create \
  --repo brianmindslab/braintime \
  --title "feat: <feature name>" \
  --body "Closes #<issue number>

## What this does
<description>

## Files changed
<list>

## Notes for reviewer
<anything Claude Code or Gemini should know>"
```

After opening the PR, mark it for review:
```bash
gh pr edit <pr-number> --add-label "needs-review"
```

## Project Basics

- **Stack:** Next.js 16 App Router, React 19, TypeScript strict, Prisma ORM, PostgreSQL, Tailwind CSS 4, shadcn/ui
- **Repo:** https://github.com/brianmindslab/braintime
- **Path alias:** `@/*` → project root
- **Auth:** Cookie-based, `getIdentity()` from `@/app/actions/admin.ts`
- **Roles:** STUDENT, TEACHER, PARENT, ADMIN
- **i18n:** English + German via `useTranslation()` hook from `@/lib/i18n.ts`
- **Grading:** Swiss 1-6 scale (6=best, 4=passing), half-steps allowed

## Your Workflow

```
1. gh issue list --label "for-codex" --state open   ← check tasks
2. git checkout -b feature/<name>
3. Implement the feature
4. npm run build  (must pass with zero errors)
5. npm run lint   (must pass)
6. git add <specific files>
7. git commit -m "feat: <name> (closes #<issue>)"
8. git push -u origin feature/<name>
9. gh pr create ...
10. gh pr edit <number> --add-label "needs-review"
11. Done. Do NOT merge.
```

## Rules

1. **Never touch main.** Always branch.
2. **Never modify existing functionality** unless the task explicitly says to.
3. **Always run `npm run build`** before committing. Fix all type errors.
4. **Match existing patterns.** Look at similar files before creating new ones:
   - Server action? Look at `app/actions/admin.ts` for the pattern.
   - New page? Look at `app/dashboard/courses/page.tsx`.
   - Client component? Look at `app/dashboard/(overview)/DashboardClient.tsx`.
5. **Add both EN and DE translations** for any user-facing text in `lib/i18n.ts`.
6. **Use shadcn/ui components** from `components/ui/`. Don't install new UI libraries.
7. **Dark mode always.** Every `bg-*` needs a `dark:bg-*` variant.
8. **Test on build, not on hope.** If you add a Prisma model, run `npx prisma generate`.

## Key Files You'll Touch Most Often

| Need | File |
|------|------|
| New page | `app/dashboard/<route>/page.tsx` (server) + `<Route>Client.tsx` (client) |
| Server action | `app/actions/<domain>.ts` |
| API route | `app/api/<route>/route.ts` |
| UI component | `components/<name>.tsx` or `components/dashboard/<name>.tsx` |
| DB schema change | `prisma/schema.prisma` → `npx prisma migrate dev --name <name>` |
| Translations | `lib/i18n.ts` — add keys to both `en` and `de` objects |
| Styles | `app/globals.css` (global) or Tailwind classes (component-level) |

## Database Quick Reference

```prisma
User       { id, email, name, role, parentId, activeMinutes }
Course     { id, title, description, language, archived }
Lesson     { id, title, courseId, content, scheduledAt, duration }
Assignment { id, title, lessonId, type, testCases, points, isHomework, isExam }
Submission { id, assignmentId, studentId, code, passed, score, autoGrade, seenByTeacher }
Enrollment { studentId, courseId }
GradeThreshold { courseId, excellentMin, goodMin, passMin, lateDeduction }
```

## Don't

- Don't install new npm packages without the task explicitly asking for it
- Don't modify `next.config.ts`, `docker-compose.yml`, or CI/CD files
- Don't change auth logic or the Providers component
- Don't write tests (no test framework is set up yet)
- Don't create README.md or documentation files unless asked
- Don't merge your own PRs
