---
name: backend-api
description: Build, modify and debug backend APIs, business logic, validation, auth and error handling
version: 1.0.0
allowed-tools: [web_search, web_fetch, github]
---

# Backend API

Use this when the task involves API endpoints, business logic, validation, authentication/authorization, database interaction, or error handling on the server.

## Workflow
1. **Trace the request path.** Follow a single request through route → middleware → controller/service → repository → data store → response.
2. **Identify the contract.** What should the request accept, what should the response contain, and what status codes are expected on success and each error path?
3. **Verify authz + validation boundaries.** Check who may call the endpoint and what validation runs BEFORE business logic.
4. **Check data access rules.** Confirm which repository/database paths are read and where transactions/rollbacks happen.
5. **Form a hypothesis.** State root cause as "endpoint returns X because logic Y does not handle case Z."
6. **Implement + test.** Add or fix logic, add/adjust handler and service tests.

## Checklist
- [ ] Traced one full request through every layer
- [ ] Documented the intended contract (inputs, outputs, status codes)
- [ ] Authz: only the correct roles/ownership can reach it
- [ ] Validation: malformed input rejected before side effects
- [ ] Errors: failures map to correct status and safe message
- [ ] Database: transactions/rollback correct for multi-step writes
- [ ] Added/adjusted tests
- [ ] Ran backend tests / typecheck

## Verification
The endpoint behaves per contract for success + validation + authz + error cases. Cite the files changed.

## Common failure prevention
- Don't put authorization inside the response formatting; it must gate the action.
- Don't leak stack traces / internals in error responses.
- Don't ignore the failing test set — run them and see them green.