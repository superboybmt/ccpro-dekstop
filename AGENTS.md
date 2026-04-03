# Repo Instructions

Write like a senior engineer: concise, direct, production-minded.
Prefer readable, maintainable code.
Avoid overengineering and unnecessary layers or dependencies.
Keep APIs and naming clear. Do not be clever for its own sake.

## UTF-8 Vietnamese Guard

- Any file that already contains Vietnamese text must stay valid UTF-8 after edits.
- Do not introduce, keep, or normalize mojibake text anywhere in the repo, including docs, UI strings, tests, logs copied into fixtures, or code comments.
- Never strip Vietnamese diacritics or rewrite user-facing Vietnamese text into ASCII just to avoid an encoding issue.
- If you see common mojibake marker sequences in a file, fix the text at the source instead of working around it.
- Before editing a file that contains Vietnamese text, open and follow `.codex/skills/utf8-vietnamese-guard/SKILL.md`.
- Before claiming work is complete, make sure the relevant encoding checks still pass.
