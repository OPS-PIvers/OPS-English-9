---
allowed-tools: Bash, SlashCommand
description: Complete deployment pipeline - git commit, push, and Apps Script deployment
---

I'll perform a complete deployment pipeline: git add, commit, push, and then deploy to Google Apps Script.

First, I'll stage all changes:
```bash
git add .
```

Next, I'll commit with a descriptive message:
```bash
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')"
```

Then I'll push to the remote repository:
```bash
git push
```

Finally, I'll deploy to Google Apps Script using the clasp command:
```
/clasp
```

This ensures your code is saved to git and deployed to the live Google Apps Script web application.