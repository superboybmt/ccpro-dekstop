# Shared Temporal Inputs Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `DatePicker` / `TimePicker` / `DateTimePicker` system for the renderer and migrate the admin shift editor off native time inputs.

**Architecture:** Add a small renderer-only temporal input foundation with pure parse/format helpers, three focused UI components, and global styles that match the existing app look. Keep storage values canonical (`YYYY-MM-DD`, `HH:mm`) and keep VN display formats (`dd/MM/yyyy`, `HH:mm`, `dd/MM/yyyy HH:mm`) inside the renderer layer only.

**Tech Stack:** React 19, TypeScript, Testing Library, Vitest, global CSS in `src/renderer/src/styles.css`, shared date helpers in `src/shared/app-time.ts`

---

## Scope

This plan is **phase 1 only**:

- ship shared temporal primitives
- migrate `admin-device-config-page.tsx` to `TimePicker`
- add tests for the new components and the updated admin screen

This plan does **not** migrate the rest of the app yet. It leaves a clean base for later rollout.

## File Map

**Create**

- `src/renderer/src/lib/temporal-input.ts`
  Renderer-only parse/format helpers for VN display strings and canonical storage values.
- `src/renderer/src/lib/__tests__/temporal-input.test.ts`
  Unit tests for display/storage conversion rules.
- `src/renderer/src/components/ui/date-picker.tsx`
  Shared date picker with typed input + compact calendar popover.
- `src/renderer/src/components/ui/time-picker.tsx`
  Shared time picker with typed input + quick-pick popup.
- `src/renderer/src/components/ui/date-time-picker.tsx`
  Composed date/time picker built from `DatePicker` + `TimePicker`.
- `src/renderer/src/components/ui/__tests__/date-picker.test.tsx`
  Interaction and formatting tests for `DatePicker`.
- `src/renderer/src/components/ui/__tests__/time-picker.test.tsx`
  Interaction tests for `TimePicker`, including typed values outside the `5-minute` quick-pick grid.
- `src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx`
  Composition tests for `DateTimePicker`.

**Modify**

- `src/renderer/src/pages/admin-device-config-page.tsx`
  Replace native time inputs in the shift editor with the shared `TimePicker`.
- `src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx`
  Update screen tests to use the new component behavior instead of querying `input[type="time"]`.
- `src/renderer/src/styles.css`
  Add shared temporal field styles and remove shift-editor dependency on native input look.
- `openspec/changes/admin-shift-editor/tasks.md`
  Mark completed phase-1 items when implementation finishes.

**Reference Only**

- `src/shared/app-time.ts`
  Existing date/time helpers and UTC+7 conventions.
- `src/renderer/src/components/ui/input.tsx`
  Current UI field conventions to match label/helper/error treatment.
- `src/renderer/src/lib/format.ts`
  Existing renderer display formatting patterns.

## Chunk 1: Temporal Foundation

### Task 1: Add renderer temporal parse/format helpers

**Files:**

- Create: `src/renderer/src/lib/temporal-input.ts`
- Test: `src/renderer/src/lib/__tests__/temporal-input.test.ts`
- Reference: `src/shared/app-time.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayTime,
  parseDisplayDate,
  parseDisplayTime
} from '../temporal-input'

describe('temporal-input helpers', () => {
  it('formats canonical values into VN display strings', () => {
    expect(formatDisplayDate('2026-04-02')).toBe('02/04/2026')
    expect(formatDisplayTime('07:30')).toBe('07:30')
    expect(formatDisplayDateTime('2026-04-02 07:30:00')).toBe('02/04/2026 07:30')
  })

  it('parses display strings back into canonical values', () => {
    expect(parseDisplayDate('02/04/2026')).toBe('2026-04-02')
    expect(parseDisplayTime('07:32')).toBe('07:32')
  })

  it('rejects invalid values without auto-correcting them', () => {
    expect(parseDisplayDate('31/02/2026')).toBeNull()
    expect(parseDisplayTime('24:00')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts`

Expected: FAIL because `temporal-input.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const formatDisplayDate = (value: string | null): string => {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export const parseDisplayTime = (value: string): string | null => {
  const match = value.trim().match(/^(\d{2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return `${match[1]}:${match[2]}`
}
```

Implementation notes:

- Keep helpers pure and renderer-only.
- Do not introduce a new date dependency.
- Add helper(s) for:
  - canonical date -> display date
  - canonical time -> display time
  - canonical datetime -> display datetime
  - display date -> canonical date
  - display time -> canonical time
  - date + time -> canonical datetime string where needed

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/temporal-input.ts src/renderer/src/lib/__tests__/temporal-input.test.ts
git commit -m "feat: add temporal input formatting helpers"
```

### Task 2: Build the shared `TimePicker`

**Files:**

- Create: `src/renderer/src/components/ui/time-picker.tsx`
- Test: `src/renderer/src/components/ui/__tests__/time-picker.test.tsx`
- Modify: `src/renderer/src/styles.css`
- Reference: `src/renderer/src/components/ui/input.tsx`
- Reference: `src/renderer/src/lib/temporal-input.ts`

- [ ] **Step 1: Write the failing test**

```tsx
it('preserves manually typed valid values outside the quick-pick step', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()

  render(<TimePicker value="07:30" onChange={onChange} />)

  const input = screen.getByRole('textbox', { name: /giờ/i })
  await user.clear(input)
  await user.type(input, '07:32')
  fireEvent.blur(input)

  expect(onChange).toHaveBeenLastCalledWith('07:32')
})

it('shows quick-pick options in 5-minute steps', async () => {
  render(<TimePicker value="07:30" onChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /chọn giờ/i }))
  expect(screen.getByRole('button', { name: '07:35' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/components/ui/__tests__/time-picker.test.tsx`

Expected: FAIL because `TimePicker` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
interface TimePickerProps {
  value: string | null
  onChange(value: string | null): void
  label?: string
  disabled?: boolean
  nullable?: boolean
  minuteStep?: number
  error?: string | null
  helperText?: string
}
```

Implementation notes:

- Use a text input so the component is not tied to native `time` UI.
- Keep popup small and desktop-first.
- Default quick-pick list uses `minuteStep = 5`.
- Do not round typed values.
- Accept `null` and expose a clear action when `nullable` is true.
- Normalize only on blur / quick-pick click.
- Treat invalid typed values as validation error, not silent correction.
- Support keyboard interaction:
  - `Enter`: commit current valid text
  - `Escape`: close popup
  - arrow keys in quick-pick list are optional in phase 1, but tab order must remain sane

- [ ] **Step 4: Run component test**

Run: `npm test -- src/renderer/src/components/ui/__tests__/time-picker.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/time-picker.tsx src/renderer/src/components/ui/__tests__/time-picker.test.tsx src/renderer/src/styles.css
git commit -m "feat: add shared time picker"
```

### Task 3: Build the shared `DatePicker`

**Files:**

- Create: `src/renderer/src/components/ui/date-picker.tsx`
- Test: `src/renderer/src/components/ui/__tests__/date-picker.test.tsx`
- Modify: `src/renderer/src/styles.css`
- Reference: `src/renderer/src/lib/temporal-input.ts`

- [ ] **Step 1: Write the failing test**

```tsx
it('shows VN display format while storing canonical date values', async () => {
  const onChange = vi.fn()
  render(<DatePicker value="2026-04-02" onChange={onChange} />)

  expect(screen.getByRole('textbox')).toHaveValue('02/04/2026')
})

it('parses a manually typed display date into canonical form on blur', async () => {
  const onChange = vi.fn()
  const user = userEvent.setup()

  render(<DatePicker value={null} onChange={onChange} />)
  const input = screen.getByRole('textbox')
  await user.type(input, '15/04/2026')
  fireEvent.blur(input)

  expect(onChange).toHaveBeenCalledWith('2026-04-15')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/components/ui/__tests__/date-picker.test.tsx`

Expected: FAIL because `DatePicker` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implementation notes:

- Use a typed text input in `dd/MM/yyyy`.
- Add a compact calendar popover with:
  - current month label
  - previous/next month buttons
  - 7-column day grid
  - selected day state
- Keep phase 1 focused:
  - no date range
  - no time zone selector
  - no preset shortcuts

- [ ] **Step 4: Run component test**

Run: `npm test -- src/renderer/src/components/ui/__tests__/date-picker.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/date-picker.tsx src/renderer/src/components/ui/__tests__/date-picker.test.tsx src/renderer/src/styles.css
git commit -m "feat: add shared date picker"
```

## Chunk 2: Composition and Admin Shift Migration

### Task 4: Build the shared `DateTimePicker`

**Files:**

- Create: `src/renderer/src/components/ui/date-time-picker.tsx`
- Test: `src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx`
- Reference: `src/renderer/src/components/ui/date-picker.tsx`
- Reference: `src/renderer/src/components/ui/time-picker.tsx`
- Reference: `src/renderer/src/lib/temporal-input.ts`

- [ ] **Step 1: Write the failing test**

```tsx
it('composes date and time controls into a canonical datetime value', async () => {
  const onChange = vi.fn()
  render(<DateTimePicker value="2026-04-02 07:30:00" onChange={onChange} />)

  expect(screen.getByRole('textbox', { name: /ngày/i })).toHaveValue('02/04/2026')
  expect(screen.getByRole('textbox', { name: /giờ/i })).toHaveValue('07:30')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx`

Expected: FAIL because `DateTimePicker` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implementation notes:

- Compose from `DatePicker` + `TimePicker`.
- Keep canonical output consistent with renderer/service needs.
- Do not introduce independent parsing logic here; reuse helper module.

- [ ] **Step 4: Run component test**

Run: `npm test -- src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ui/date-time-picker.tsx src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx
git commit -m "feat: add composed datetime picker"
```

### Task 5: Migrate the admin shift editor to `TimePicker`

**Files:**

- Modify: `src/renderer/src/pages/admin-device-config-page.tsx`
- Modify: `src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx`
- Modify: `src/renderer/src/styles.css`
- Reference: `src/renderer/src/components/ui/time-picker.tsx`

- [ ] **Step 1: Write the failing screen test**

Replace the native-input assertion with a shared-component assertion:

```tsx
expect(screen.getAllByRole('textbox', { name: /giờ/i }).map((input) => (input as HTMLInputElement).value)).toContain('07:00')
```

Add one interaction test:

```tsx
it('saves a manually typed shift time through the shared TimePicker', async () => {
  const updateShift = vi.fn(async () => ({ ok: true, message: 'saved' }))
  const user = userEvent.setup()

  render(<AdminDeviceConfigPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Hệ thống' }))

  const startInput = await screen.findByRole('textbox', { name: /vào ca/i })
  await user.clear(startInput)
  await user.type(startInput, '07:32')
  fireEvent.blur(startInput)
  fireEvent.click(screen.getByRole('button', { name: /lưu thay đổi/i }))

  await waitFor(() => {
    expect(updateShift).toHaveBeenCalledWith(expect.objectContaining({ onduty: '07:32' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx`

Expected: FAIL because the page still uses `input[type="time"]`.

- [ ] **Step 3: Write minimal implementation**

Implementation notes:

- Replace each shift editor native time input with `TimePicker`.
- Keep nullable lunch behavior:
  - `null` -> show empty state / add action
  - clear action -> `null`
- Use semantic labels so tests and accessibility do not rely on CSS selectors.
- Remove any page-specific logic that assumes `input[type="time"]`.
- Keep payloads canonical `HH:mm` / `null` when calling `window.ccpro.adminShifts.updateShift`.

- [ ] **Step 4: Run page test**

Run: `npm test -- src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/admin-device-config-page.tsx src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx src/renderer/src/styles.css
git commit -m "feat: migrate admin shift editor to shared time picker"
```

### Task 6: Run verification and update tracking docs

**Files:**

- Modify: `openspec/changes/admin-shift-editor/tasks.md`

- [ ] **Step 1: Run focused renderer tests**

Run:

```bash
npm test -- src/renderer/src/lib/__tests__/temporal-input.test.ts src/renderer/src/components/ui/__tests__/time-picker.test.tsx src/renderer/src/components/ui/__tests__/date-picker.test.tsx src/renderer/src/components/ui/__tests__/date-time-picker.test.tsx src/renderer/src/pages/__tests__/admin-device-config-page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the broader regression tests that touch time display**

Run:

```bash
npm test -- src/main/services/__tests__/notification-service.test.ts src/main/services/__tests__/admin-shift-repository.test.ts src/main/services/__tests__/admin-shift-service.test.ts
```

Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build:dir`

Expected: successful renderer/main build with no type errors from the new components.

- [ ] **Step 4: Manual verification checklist**

Verify in app:

- shift editor shows `HH:mm`, never `AM/PM`
- quick-pick list uses `5-minute` increments
- typing `07:32` persists `07:32`
- nullable lunch fields can be added and cleared
- save payload still updates WiseEye correctly
- notification behavior remains correct after a shift edit

- [ ] **Step 5: Update OpenSpec task tracking**

Mark complete in `openspec/changes/admin-shift-editor/tasks.md`:

- `5.1` through `5.6` when done
- append follow-up task for phase-2 migration inventory if additional screens are discovered during implementation

- [ ] **Step 6: Commit**

```bash
git add openspec/changes/admin-shift-editor/tasks.md
git commit -m "docs: update temporal input rollout progress"
```

## Notes for Implementation

- Do **not** add a third-party date picker dependency unless the existing approach becomes unmanageable and the user explicitly approves the dependency.
- Prefer small, focused components over a single giant temporal field.
- Keep styling inside the existing global CSS system instead of introducing a new styling framework.
- Keep display formatting inside renderer helpers; do not leak `dd/MM/yyyy` strings into IPC or DB layers.
- If a later screen needs different quick-pick steps, expose `minuteStep` as a prop but keep the default at `5`.
- If accessibility gaps remain after phase 1, capture them as explicit follow-up work instead of hiding them.
