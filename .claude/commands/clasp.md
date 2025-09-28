---
allowed-tools: Bash(clasp:*)
description: Push code changes and redeploy Google Apps Script web app
---

I'll push your code changes to Google Apps Script and redeploy the web app.

First, I'll push the local changes:
```bash
clasp push
```

Then I'll redeploy to the active web app deployment:
```bash
clasp deploy --deploymentId AKfycbxGguRYf8MLjDyAz1IhxWcPReVo8PXGybLyBccChzdYm9aroOM0llvniUO0KpA7WD0qTw
```

This will update your Google Apps Script project and ensure the web app is running the latest version of your code.