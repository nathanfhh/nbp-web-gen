---
name: review-readme
description: 檢查 README.md 是否需要根據最近的 commits 更新。Use when the user wants to review whether README.md is up-to-date with recent code changes. Triggers on requests like "review readme", "check readme", "檢查 README", "更新 README", or when the user invokes /review-readme. Analyzes all commits since the last README.md modification and suggests specific updates if needed.
---

# Review README

Analyze commits since the last README.md modification and determine whether README.md needs updating.

## Workflow

1. **Find the last README.md commit**
   ```bash
   git log -1 --format="%H %s" -- README.md
   ```

2. **List all commits since that point**
   ```bash
   git log <last-readme-commit>..HEAD --oneline --no-merges
   ```
   If no commits exist, report "README.md is up-to-date" and stop.

3. **Analyze each commit for README-relevance**
   Review diffs (`git show <hash> --stat` and `git show <hash>` as needed). Flag changes that affect README.md:
   - New or removed features / generation modes
   - New or changed commands (`npm run ...`)
   - New dependencies or prerequisites
   - Architecture changes (new composables, stores, workers, routes)
   - Changed API / configuration patterns
   - New environment variables or setup steps

4. **Report findings in zh-TW**
   Present a structured summary:
   - **相關 commits**: Commits that may require README updates, with brief reason
   - **建議修改**: For each, describe the specific README section(s) to update and the proposed change
   - **無需修改**: Commits confirmed irrelevant (bug fixes, style tweaks, test-only, etc.)

5. **Confirm and apply**
   Ask the user to confirm the proposed changes before editing README.md.
   After confirmation, apply edits and show a summary of what was changed.
