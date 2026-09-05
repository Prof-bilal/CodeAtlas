---
name: frontend-debugging
description: Debug React and Next.js frontend issues, hydration, state bugs and UI regressions
version: 1.0.0
allowed-tools: [web_search, web_fetch]
---

# Frontend Debugging

Use this when the task involves diagnosing or fixing a frontend/UI bug.

## Workflow
1. **Reproduce first.** Identify the exact user action and observed vs expected behavior before touching code.
2. **Locate the component.** Find the component(s) that render the symptom; trace ownership of the relevant state.
3. **Trace state, not just UI.** Map where state is created, mutated, and read. Include hooks, context/providers, and derived values. A UI bug is usually a state/derived-data bug.
4. **Check the render path.** For React: re-renders, keys, conditional mounts, effect deps. For Next.js: client vs server boundaries, hydration-sensitive paths, caching.
5. **Form a hypothesis.** State the root cause as: "value X is wrong because source Y mutates it without Z observing it."
6. **Apply the smallest fix** that changes the observed behavior, without altering unrelated UI.

## Checklist
- [ ] Reproduced with a concrete repro case (action → observed → expected)
- [ ] Identified all components that render the symptom
- [ ] Traced state source → mutation → read sites
- [ ] Checked hydration path (SSR client/server mismatch) where relevant
- [ ] Fix is minimal and localized
- [ ] Ran the frontend tests / typecheck
- [ ] Manually verified the original repro is fixed and no adjacent UI broke

## Verification
Existing frontend tests must pass. Provide the repro steps you used so the fix can be re-verified identically.

## Common failure prevention
- Don't fix the symptom in a render component when the source is state/cache.
- Don't introduce unnecessary re-renders to mask a state bug.
- On hydration bugs, confirm the fix is server/client-consistent, not just one side.