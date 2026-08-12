#!/usr/bin/env node
"use strict";
// paperr bootstrap: clone the repo, then hand off to its own launcher, which
// installs deps, builds, starts the server and opens the app. Re-running
// against an existing checkout skips the clone, so this doubles as "start it".
//
// Reached two ways — `npx paperr [dir]`, or downloaded straight from the repo
// by the one-click files in install/. Keep it dependency-free for that reason.

const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const REPO = "https://github.com/biswasprateek/paperr.git";
const args = process.argv.slice(2);
const dev = args.includes("--dev");
const dir = path.resolve(args.find((a) => !a.startsWith("-")) || "paperr");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  // The server uses node:sqlite, which landed in 22.5.
  console.error(`paperr needs Node 22.5+ — you have ${process.versions.node}. https://nodejs.org/en/download`);
  process.exit(1);
}

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (r.error) {
    console.error(`paperr: could not run ${cmd} — ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status);
}

const launcher = path.join(dir, "scripts", "launch.js");

if (!existsSync(launcher)) {
  if (existsSync(path.join(dir, ".git"))) {
    // A checkout from before the launcher existed, or just behind — update it
    // in place rather than making people delete and re-clone.
    console.log(`[paperr] Updating your existing install in ${dir}...`);
    run("git", ["pull", "--ff-only"], dir);
  } else if (existsSync(dir)) {
    // Usually a clone that was interrupted partway; git won't clone into it.
    console.error(`"${dir}" exists but isn't a complete paperr checkout.`);
    console.error("Delete it and run this again, or pass another directory.");
    process.exit(1);
  } else {
    console.log(`[paperr] Downloading paperr into ${dir} (a one-time step)...`);
    run("git", ["clone", "--depth", "1", REPO, dir]);
  }
}

if (!existsSync(launcher)) {
  // Clear message beats the "Cannot find module" node would throw below.
  console.error(`"${dir}" has no scripts/launch.js, so there is nothing to start.`);
  console.error(`${REPO} may not carry it yet — try again once it does.`);
  process.exit(1);
}

run(process.execPath, [launcher, ...(dev ? ["--dev"] : [])], dir);
