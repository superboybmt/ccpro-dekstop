# History Temporal Inputs Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the attendance history page off native month/date inputs onto shared temporal components while preserving canonical query params.

**Architecture:** Extend the renderer temporal input set with a focused `MonthPicker` that mirrors the existing `DatePicker` / `TimePicker` pattern. Update `HistoryPage` to use `MonthPicker` for the default month filter and `DatePicker` for the custom range filter, keeping URL params canonical (`YYYY-MM`, `YYYY-MM-DD`) and display formats Vietnamese (`MM/yyyy`, `dd/MM/yyyy`).

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, shared renderer temporal helpers, global CSS in `src/renderer/src/styles.css`

---

## Scope

This phase only covers:

- shared `MonthPicker`
- `HistoryPage` filter migration
- focused tests + build verification

This phase does not touch:

- backend history APIs
- pagination/data table behavior
- other screens still using native temporal inputs

## File Map

**Create**

- `src/renderer/src/components/ui/month-picker.tsx`
- `src/renderer/src/components/ui/__tests__/month-picker.test.tsx`
- `src/renderer/src/pages/__tests__/history-page.test.tsx`

**Modify**

- `src/renderer/src/lib/temporal-input.ts`
- `src/renderer/src/lib/__tests__/temporal-input.test.ts`
- `src/renderer/src/pages/history-page.tsx`
- `src/renderer/src/styles.css`
- `openspec/changes/admin-shift-editor/proposal.md`
- `openspec/changes/admin-shift-editor/design.md`
- `openspec/changes/admin-shift-editor/tasks.md`

## Chunk 1: Month Foundation

### Task 1: Extend temporal helpers for canonical month values

**Files:**
- Modify: `src/renderer/src/lib/temporal-input.ts`
- Test: `src/renderer/src/lib/__tests__/temporal-input.test.ts`

- [ ] **Step 1: Write the failing test**

Add coverage for:
- `formatDisplayMonth('2026-04') -> '04/2026'`
- `parseDisplayMonth('04/2026') -> '2026-04'`
- invalid month values return `null`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts`

Expected: FAIL because month helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add pure helpers:
- `formatDisplayMonth`
- `parseDisplayMonth`
- `getMonthOptions` if useful for `MonthPicker`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts`

Expected: PASS

## Chunk 2: Shared MonthPicker

### Task 2: Add shared `MonthPicker`

**Files:**
- Create: `src/renderer/src/components/ui/month-picker.tsx`
- Test: `src/renderer/src/components/ui/__tests__/month-picker.test.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] **Step 1: Write the failing test**

Cover:
- canonical value shows as `MM/yyyy`
- typing `04/2026` commits `2026-04`
- quick-pick month list can choose a month

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/components/ui/__tests__/month-picker.test.tsx`

Expected: FAIL because `MonthPicker` does not exist.

- [ ] **Step 3: Write minimal implementation**

Build a compact picker that matches current temporal field styles:
- typed text input
- month quick-pick popover
- canonical `YYYY-MM` output
- no native `input[type="month"]`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/components/ui/__tests__/month-picker.test.tsx`

Expected: PASS

## Chunk 3: History Page Migration

### Task 3: Migrate `HistoryPage` filters

**Files:**
- Modify: `src/renderer/src/pages/history-page.tsx`
- Test: `src/renderer/src/pages/__tests__/history-page.test.tsx`

- [ ] **Step 1: Write the failing test**

Cover:
- month filter displays `MM/yyyy` while still requesting `month: 'YYYY-MM'`
- date range filter displays `dd/MM/yyyy` while still requesting canonical `startDate` / `endDate`
- reset action returns to default month mode

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/pages/__tests__/history-page.test.tsx`

Expected: FAIL because page still uses native inputs.

- [ ] **Step 3: Write minimal implementation**

Replace:
- native `type="month"` with `MonthPicker`
- native `type="date"` range inputs with shared `DatePicker`

Keep behavior:
- month mode active when no custom range
- custom range sends canonical `start` / `end`
- reset clears range and restores current month

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/pages/__tests__/history-page.test.tsx`

Expected: PASS

## Chunk 4: Verification and Tracking

### Task 4: Verify phase 2 and update OpenSpec

**Files:**
- Modify: `openspec/changes/admin-shift-editor/tasks.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts src/renderer/src/components/ui/__tests__/month-picker.test.tsx src/renderer/src/components/ui/__tests__/date-picker.test.tsx src/renderer/src/pages/__tests__/history-page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run build**

Run:

```bash
npx electron-vite build
```

Expected: PASS

- [ ] **Step 3: Update OpenSpec**

Mark complete when done:
- `5.8`
- `5.9`
- `6.7`

