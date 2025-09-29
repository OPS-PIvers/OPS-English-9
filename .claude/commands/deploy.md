---
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(clasp:*), SlashCommand(/clasp)
description: Complete deployment pipeline - git commit, push, and Apps Script deployment
---

Performing complete deployment pipeline: git add, commit, push, and Apps Script deployment.

!git add .

!git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')"

!git push

/clasp