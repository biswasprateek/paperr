#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");

const REPO = "https://github.com/biswasprateek/paperr.git";
const dir = process.argv[2] || "paperr";

if (existsSync(dir)) {
  console.error(`"${dir}" already exists. Pass a different directory: npx paperr <dir>`);
  process.exit(1);
}

const git = spawnSync("git", ["clone", "--depth", "1", REPO, dir], { stdio: "inherit" });

if (git.error) {
  console.error(`git is required to install paperr — ${git.error.message}`);
  console.error(`Or download it directly: ${REPO.replace(/\.git$/, "")}`);
  process.exit(1);
}
if (git.status !== 0) process.exit(git.status);

console.log(`
  paperr cloned into ./${dir}

    cd ${dir}
    npm run install:all
    npm run dev

  Needs Node 22.5+. Docs: https://github.com/biswasprateek/paperr#readme
`);
