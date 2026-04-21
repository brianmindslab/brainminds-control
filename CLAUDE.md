# CLAUDE.md — Braintime LMS (Local Development)

> This file is read by Claude Code at session start. It contains everything you need to work on this project.

## You Are

The **primary developer** for Braintime LMS. You read code, write code, run tests, commit, and push. You work locally on the Mac. You are the **hands and brain** of this project.

## Where Tasks Come From — GitHub Issues

**All tasks live at: https://github.com/brianmindslab/braintime/issues**

At the start of every session, check for open issues:
```bash
gh issue list --repo brianmindslab/braintime --label "ai-task" --state open
```

Priority order:
1. `P0-critical` — fix immediately, do not start anything else
2. `P1-important` — main work
3. `P2-enhancement` — when P0/P1 are clear
4. `for-claude-code` — specifically assigned to you

When you start a task:
```bash
gh issue edit <number> --repo brianmindslab/braintime --add-label "in-progress"
```

When you finish:
```bash
# Your commit message closes the issue automatically:
git commit -m "fix: dashboard null crash (closes #14)"
# Or manually:
gh issue close <number> --repo brianmindslab/braintime --comment "Fixed in commit abc1234"
```

**Server Claude** creates issues with exact file paths, line numbers, and the fix. Read the issue body fully before starting — it contains the diagnosis already done.

**Codex** opens PRs from feature branches. You review and merge them:
```bash
gh pr list --repo brianmindslab/braintime
gh pr diff <number>
gh pr merge <number> --squash
```

When a PR needs Gemini review, add the label:
```bash
gh pr edit <number> --add-label "needs-review"
```

---

## Project Identity

- **Name:** Braintime LMS v1.7.0
- **What:** Coding education platform for students (ages 10-18) in Switzerland
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma ORM, PostgreSQL, Tailwind CSS 4, shadcn/ui
- **Code execution:** Judge0 CE (remote, self-hosted at a separate IP)
- **Deployment:** Docker → GitHub Actions → ghcr.io → production server via SSH
- **Languages:** English + German (i18n via lib/i18n.ts)
- **Repo:** https://github.com/brianmindslab/braintime

## Critical Conventions

### Swiss Grade System
- Scale: **1 to 6** in half-steps (1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6)
- **6 = best**, **1 = worst**, **4 = passing**
- Color coding: ≥5.5 emerald, ≥4 neutral/yellow, ≥3 amber, <3 red
- This is NOT the American A-F system. Never use letter grades.

### Auth Pattern
- Cookie-based sessions (`demo_user_id` cookie, httpOnly)
- `getIdentity()` in `app/actions/admin.ts` returns the current user (cached per request)
- Roles: `STUDENT`, `TEACHER`, `PARENT`, `ADMIN`
- Admin impersonation via `original_admin_id` cookie
- Always check: `const identity = await getIdentity(); if (!identity) redirect("/");`

### Server Actions Pattern
- All in `app/actions/*.ts` with `"use server"` directive
- Always validate with Zod, always check auth, always try-catch
- Use `revalidatePath()` after mutations
- Log critical operations to SystemLog table

### UI/Component Patterns
- Dark mode default, light mode via localStorage toggle
- Theme vars in `globals.css` using oklch color space
- All UI primitives from `components/ui/` (shadcn/ui)
- Animations via Framer Motion (`motion`, `AnimatePresence`)
- Icons from `lucide-react`
- Path alias: `@/*` maps to project root

### Code Editor
- Monaco Editor on desktop, plain `<textarea>` fallback on mobile
- `useIsMobile()` hook detects via user agent
- Judge0 API for Python, C++, JavaScript execution
- Test cases stored as JSON on Assignment model

### Responsive Design
- Primary breakpoint: `md:` (768px) — mobile vs desktop
- Secondary: `xl:` (1280px) — sidebar auto-collapse
- Mobile: hamburger menu + slide-out sidebar
- Parent role gets bottom tab navigation on mobile

## Architecture

```
app/
├── layout.tsx              # Root: Inter font, Providers, viewport meta
├── globals.css             # Tailwind 4 + oklch theme vars
├── page.tsx                # Login/register page
├── actions/                # Server actions (the "backend")
│   ├── admin.ts            # Auth, users, identity, CRUD
│   ├── grades.ts           # Grading logic, demo seed
│   ├── submissions.ts      # Submission queries
│   ├── lessons.ts          # Lesson scheduling
│   ├── courses.ts          # Course CRUD
│   ├── attendance.ts       # Attendance tracking
│   └── calendar.ts         # Calendar operations
├── api/
│   ├── run/route.ts        # POST: Execute code via Judge0
│   ├── run/submit/route.ts # POST: Submit + grade + save
│   ├── quiz/route.ts       # POST: Quiz answers
│   ├── log/route.ts        # POST: Client-side error logging
│   ├── calendar/export/    # Calendar export
│   └── diagnostics/        # Health check
├── dashboard/
│   ├── layout.tsx          # Auth guard, sidebar, main content area
│   ├── (overview)/         # Student dashboard (DashboardClient.tsx)
│   ├── [lessonId]/         # Classroom (ClassroomClient.tsx, QuizClient.tsx, TheoryView.tsx)
│   ├── courses/            # Course listing + browse
│   ├── grades/             # Student grades view
│   ├── submissions/        # Submission history
│   ├── calendar/           # Calendar view
│   ├── settings/           # User settings
│   ├── teacher/            # Teacher tools (grades, lessons, courses, assignments)
│   ├── parent/             # Parent portal
│   ├── admin/              # Admin panel
│   └── help/               # Help page
components/
├── ui/                     # shadcn/ui primitives (button, card, input, etc.)
├── dashboard/
│   ├── Sidebar.tsx         # Main navigation (478 lines, role-aware)
│   ├── IdentitySwitcher.tsx
│   ├── EnrollButton.tsx
│   └── overview/           # Dashboard widgets
├── Providers.tsx           # I18n + theme context
├── ClientLogger.tsx        # Error boundary logging
└── TaskDescription.tsx     # Assignment display
lib/
├── prisma.ts               # Singleton PrismaClient
├── auth.ts                 # bcrypt hash/verify
├── i18n.ts                 # EN/DE translations (useTranslation hook)
├── logger.ts               # SystemLog + Telegram alerts
├── utils.ts                # Helpers (date format, grade conversion)
└── rateLimit.ts            # In-memory rate limiter
```

## Database Models (Prisma)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| User | All users | email, name, role, parentId, activeMinutes |
| Course | Courses | title, language, openAt, closeAt, archived |
| TeacherCourse | Teacher↔Course M2M | teacherId, courseId |
| Lesson | Lessons in courses | title, content(md), scheduledAt, duration, modulesConfig(json) |
| Assignment | Exercises/quizzes | type(CODE/QUIZ/MC/FILL/THEORY), testCases(json), points, isHomework, isExam |
| Submission | Student attempts | code, passed, score, grade, autoGrade, autoScore, seenByTeacher |
| Enrollment | Student↔Course M2M | studentId, courseId |
| Attendance | Lesson attendance | joinedAt, leftAt, duration |
| GradeThreshold | Per-course grading config | excellentMin, goodMin, passMin, lateDeduction, gracePeriodMinutes |
| SystemLog | Audit trail | event, level, user, details |

## Environment Variables

```
DATABASE_URL=postgresql://...
JUDGE0_API_URL=http://...:2358
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx prisma studio    # Visual DB browser
npx prisma migrate dev --name <name>  # Create migration
npx prisma generate  # Regenerate client after schema change
npx prisma db push   # Push schema changes (no migration file)
```

## Git & Deploy

- Push to `main` → GitHub Actions → Docker build → ghcr.io → SSH deploy to production
- Production: `/opt/braintime` on the server, `docker-compose.yml` pulls from ghcr.io
- Always create feature branches for non-trivial work
- Commit messages: concise, lowercase, present tense ("fix mobile layout", "add grade export")
- Reference issues in commits: `git commit -m "fix: thing (closes #12)"`

## Known Issues / Tech Debt

1. `crypto.randomUUID` crashes on HTTP (not HTTPS) — needs polyfill in layout.tsx `<head>`
2. `passedSubmissions` query in `(overview)/page.tsx` ~line 157 crashes when studentId is empty — needs null guard
3. `recordActiveTime()`, `linkParentToStudent()`, `getSystemLogs()`, `getAllCoursesWithDetails()` in admin.ts missing auth checks
4. Null dereference in dashboard loaders — need optional chaining on nested relations
5. No rate limiting on `/api/run/submit`
6. No error boundary at `[lessonId]/error.tsx`
7. Judge0 API response not wrapped in try-catch for JSON parse errors

## Style Rules

- Use Tailwind classes, never inline styles (except dynamic values)
- Dark mode: always provide `dark:` variant for every color
- Spacing: multiples of 4px (p-1=4px, p-2=8px, p-4=16px, etc.)
- Border radius: use theme tokens (rounded-lg, rounded-xl, rounded-2xl)
- Font weights: font-black for labels/badges, font-bold for headings, font-medium for body
- Text sizes: text-[9px]/text-[10px] for tiny labels, text-xs for secondary, text-sm for body
- Animations: keep under 300ms, use spring physics for slide-ins
