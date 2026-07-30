# Coding Standards

This project follows coding standards documented in the wiki. See [Coding Standards](https://forge.example.com/wiki/f891a2c1-37bd-426e-922e-0e1fc9014876) (pageId: `f891a2c1-37bd-426e-922e-0e1fc9014876`).

## Key Standards

### Structured Logging Only
- No `console.log`/`warn`/`error` in `apps/forge-orchestrator`
- Use the structured logger at `apps/forge-orchestrator/src/logger.ts`
- Every log line is one JSON object with `ts`, `level`, `slug`, `msg`
- Pass context as the second argument; never interpolate into the message string

### All LLM Calls Through One Place
- Every Bedrock call goes through `apps/forge-orchestrator/src/llm-client.ts` (`converseWithLLM` / `converseAs`)
- Never construct a `BedrockRuntimeClient` directly
- Ask for a model **role** (`cheap` / `default` / `escalated`), never a model id
- Model ids live only in `llm/models.config.json` and deploy configuration

### Next.js Specifics
- Read the relevant guide in `node_modules/next/dist/docs/` before frontend work
- `searchParams` and `params` are Promises
- `useSearchParams` needs a Suspense boundary

### General Rules
- No `any`, no lazy attribute access
- Imports at the top of the file
- Never weaken a test to make it pass
- Never commit `.env` or credentials
- Feature branch → PR → merge workflow
- Never push to `main`, force-push or amend
- Migrations go through the repo's Prisma migration flow; do not hand-edit generated migration files
