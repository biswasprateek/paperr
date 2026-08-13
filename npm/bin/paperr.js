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

// optional: report the failure instead of exiting, for steps a run can survive.
function run(cmd, cmdArgs, cwd, optional) {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  const failed = Boolean(r.error) || r.status !== 0;
  if (!failed || optional) return !failed;
  if (r.error) {
    console.error(`paperr: could not run ${cmd} — ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status);
}

const launcher = path.join(dir, "scripts", "launch.js");

if (existsSync(path.join(dir, ".git"))) {
  // Every run, not just when the launcher is missing: an existing checkout used
  // to be left alone entirely, so it kept starting whatever code it was first
  // cloned at no matter how many releases had shipped since.
  console.log(`[paperr] Updating your existing install in ${dir}...`);
  if (!run("git", ["pull", "--ff-only"], dir, true)) {
    // Offline, or the checkout has local commits/edits. Neither is a reason to
    // refuse to start what's already installed.
    console.warn("[paperr] Couldn't update — starting the version you have.");
  }
} else if (!existsSync(dir)) {
  console.log(`[paperr] Downloading paperr into ${dir} (a one-time step)...`);
  run("git", ["clone", "--depth", "1", REPO, dir]);
} else if (!existsSync(launcher)) {
  // Usually a clone that was interrupted partway; git won't clone into it.
  console.error(`"${dir}" exists but isn't a complete paperr checkout.`);
  console.error("Delete it and run this again, or pass another directory.");
  process.exit(1);
}
// A complete copy that isn't a clone (a downloaded zip) falls through: nothing
// to update, but it still starts.

if (!existsSync(launcher)) {
  // Clear message beats the "Cannot find module" node would throw below.
  console.error(`"${dir}" has no scripts/launch.js, so there is nothing to start.`);
  console.error(`${REPO} may not carry it yet — try again once it does.`);
  process.exit(1);
}

run(process.execPath, [launcher, ...(dev ? ["--dev"] : [])], dir);
