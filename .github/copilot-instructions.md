# Copilot Instructions for This Project

## Project Context
- Desktop-oriented Progressive Web App (PWA)

- Goal: Cross-platform usage via browser with optional PWA installation
  - The application must work directly in the browser without installation.
  - The application should also support installation as a PWA.
  - Installed versions should support offline usage where possible.
- Language: TypeScript
- Architecture: Frontend + Middleware + Backend
- Planned stack: Vue 3 + Vite (subject to change)
- Focus: Simple, understandable, and maintainable code

---

## Language Rules (STRICT)
- Chat output must always be in **English**.
- Code, variable names, and function names **MUST** be in English.
- Comments and explanations may be in English or German.
  - If they reference RPG rules or game mechanics, **prefer German**.
- Development plans and all code-centric documents **MUST** be in English.
- RPG rule-centric documents (e.g. rulebook data, game descriptions) **heavily prefer German**.

---

## Workflow Rules (STRICT)
- ALWAYS create a plan with 3–7 steps before writing any code.
- NEVER write code immediately without a plan.
- DO NOT modify existing files without explicit approval.
- DO NOT create new files without approval.
- Before suggesting changes, always include:
  - affected files
  - short explanation of why the change is needed
- After presenting the plan, WAIT for confirmation before continuing.

---

## Response Structure
Every response must follow this structure:

1. Plan
2. Explanation (clear and concise)
3. Proposal (code or changes)
4. Risks / Assumptions

---

## TypeScript Guidelines
- Use explicit and clear typings.
- Avoid `any` unless strongly justified.
- Explain TypeScript concepts in a simple, beginner-friendly way.
- Justify important typing decisions.
- Prefer readability over advanced type complexity.

---

## Comments & Readability
- Every function must include a header with:
  - purpose
  - parameters
  - return value
- Write comments so they are easy to understand.
- Do not over-comment obvious code.
- Explain complex logic in simple terms.

---

## Architecture & Simplicity
- Prefer simple solutions over complex ones.
- Avoid overengineering and unnecessary design patterns.
- Use as few external libraries as possible.
- If proposing a library:
  - explain why it is needed
  - explain the trade-offs

---

## PWA Guidelines
- Focus on desktop usage but keep responsive design in mind.
- Optimize for performance and small bundle size.
- Consider offline capability (Service Worker).
- Avoid unnecessary network requests.

---

## File System Handling (CRITICAL)
- Browsers cannot directly access the file system without user permission.
- Prefer using the File System Access API.
- Alternatively, use a backend for file operations.
- Always point out limitations, permissions, and browser restrictions.

---

## State Management
- Prefer simple local state (Vue `ref` / `reactive`).
- Only suggest a global state library (e.g. Pinia) if clearly needed.
- Keep state structures simple and easy to understand.

---

## Error Handling & Debugging
- Always consider basic error handling.
- Validate inputs where appropriate.
- Point out common errors and pitfalls.
- Suggest simple debugging strategies when useful.

---

## Security
- Avoid unsafe patterns or APIs.
- Validate user input.
- Highlight potential risks or side effects.

---

## Behavior When Uncertain
- Ask targeted clarification questions when needed.
- Do not guess.
- Clearly state assumptions.

---

## Style & Philosophy
- Be pragmatic and solution-oriented.
- Focus on clarity and maintainability.
- Prefer understandable code over clever solutions.
