# Contributing to paperr

Thanks for considering a contribution. paperr is local-first and self-hosted by design — keep that in mind for anything you propose: no telemetry, no calls home, no cloud dependency added silently.

## Reporting bugs

1. Search [existing issues](../../issues) first — someone may have already filed it.
2. If it's new, open a [bug report](../../issues/new?template=bug_report.md) and include:
   - Steps to reproduce
   - What you expected vs. what happened
   - Your OS, Node version (`node -v`), and browser
   - Relevant logs or screenshots

Please don't open a public issue for a security vulnerability — use GitHub's private **Security → Report a vulnerability** flow on this repo instead.

## Requesting features

Open an issue describing the problem you're trying to solve, not just the solution you have in mind — it's easier to find the right (often smaller) fix that way.

## Contributing code

### Setup

```bash
git clone https://github.com/biswasprateek/paperr.git
cd paperr
npm run install:all   # installs root, server, and client deps + env setup
npm run dev            # runs server + client together
```

Requires Node 22.5+ (paperr uses the built-in `node:sqlite` module). See the [Project layout](README.md#project-layout) section of the README for where things live.

### Making changes

- Branch off `main`: `git checkout -b fix/short-description`
- Keep PRs focused on one fix or feature — easier to review, easier to revert if wrong
- Match the style of the surrounding code (no linter is configured yet, so let existing files be the guide)
- There's no automated test suite yet — run the app locally (`npm run dev`) and manually verify your change before opening a PR
- Update the README if you change user-facing behavior

### Submitting a pull request

- Push to your fork and open a PR against `dev`
- Describe what changed, why, and how you tested it
- Link the related issue if there is one

## Our expectations

- Be respectful — critique code, not people
- Keep discussion on-topic and constructive
- No harassment, hate speech, or spam
- Maintainers may decline changes that don't fit paperr's local-first, no-telemetry philosophy — that's not personal, it's the whole point of the project

By contributing, you agree your contributions are licensed under this project's [Apache 2.0 license](LICENSE).
