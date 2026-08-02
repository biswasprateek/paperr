# paperr

Self-hosted household OS — tasks, calendar, notes, and a local AI assistant, all LAN-only.

**This npm package is a thin installer.** paperr is a full application, not a library — the code lives at **[github.com/biswasprateek/paperr](https://github.com/biswasprateek/paperr)**.

```bash
npx paperr           # clones the repo into ./paperr
npx paperr my-dir    # ...or into ./my-dir

cd paperr
npm run install:all  # root + server + client deps, creates server/.env
npm run dev          # API on :3000, client on :5173
```

Requires **Node 22.5+** (the server uses the built-in `node:sqlite` module) and `git`.

Full docs, screenshots, production setup, and configuration: **[README on GitHub](https://github.com/biswasprateek/paperr#readme)**.

Apache-2.0
