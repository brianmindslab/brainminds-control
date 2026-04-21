import { spawnSync } from 'child_process';

const REVIEW_PROMPT = (diff) => `You are reviewing a GitHub PR for Braintime LMS (Next.js 16, TypeScript, Prisma, Tailwind CSS 4).

Review this diff for:
1. Security issues (missing auth checks, SQL injection, exposed secrets)
2. TypeScript errors or missing null checks
3. Missing dark mode variants (every bg-* needs dark:bg-*)
4. Missing German translations (user-facing strings must use t('key'))
5. Performance issues (N+1 queries, missing dynamic imports for heavy components)

Format your response as:
## Critical (must fix before merge)
## Improvements (should fix)
## Nitpicks (optional)
## Verdict: APPROVE / REQUEST CHANGES / BLOCK

DIFF:
${diff}`;

export function runGeminiAgent(diff) {
  const result = spawnSync('gemini', ['--prompt', REVIEW_PROMPT(diff)], {
    encoding: 'utf8',
    timeout: 60000,
  });

  if (result.error) return `Gemini review failed: ${result.error.message}`;
  return result.stdout || result.stderr || 'Gemini returned no output';
}
