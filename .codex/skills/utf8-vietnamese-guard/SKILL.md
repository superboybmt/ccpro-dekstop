---
name: utf8-vietnamese-guard
description: Use when editing files that contain Vietnamese text so UTF-8 stays intact and mojibake or ASCII fallback text does not get introduced.
---

# UTF-8 Vietnamese Guard

## Overview

This repo treats Vietnamese text integrity as a hard requirement. Do not "fix" encoding problems by removing diacritics, rewriting text into ASCII, or leaving mojibake behind.

## When to Use

- Editing source, tests, docs, scripts, or UI strings that contain Vietnamese.
- Copying Vietnamese text from logs, terminal output, or another editor.
- Investigating suspicious text that looks like mojibake marker sequences.

## Required Workflow

1. Read the file first and confirm whether the Vietnamese text is currently correct or already damaged.
2. If the file contains Vietnamese, preserve the original Vietnamese text with diacritics.
3. If mojibake is present, repair the text in the source file instead of replacing it with ASCII.
4. Run the encoding checks after the edit:
   - `npm run check:encoding`
   - `npm run test:encoding`
5. If the change also touched UI or tests, run the focused tests for that area too.

## Hard Rules

- Do not turn Vietnamese UI text into ASCII fallback text.
- Do not keep mojibake in the codebase just because another test passes.
- Do not claim completion without rerunning the encoding checks.

## Quick Check

- The Vietnamese text reads naturally in the editor.
- No mojibake markers remain.
- `npm run check:encoding` passes.
- `npm run test:encoding` passes.
