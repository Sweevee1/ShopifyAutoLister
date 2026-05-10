# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShopifyAutoLister is an automation tool for managing Shopify product listings. The project is in early development — no source code has been written yet.

## Tech Stack

The `.gitignore` indicates a mixed Node.js + Python stack. Update this section once the stack is decided and scaffolded.

## GitHub Sync

This project auto-syncs with GitHub via hooks configured in `.claude/settings.json`:

- **On session start** — `git pull --rebase` runs automatically to pull the latest changes.
- **On session end** — any uncommitted changes are committed as "Auto-save from Claude Code session" and pushed.

This means the same behaviour applies on any device that clones this repo — the hooks are committed and shared.

`.claude/settings.local.json` is gitignored (machine-specific permissions); `.claude/settings.json` is committed (shared hooks).

## Environment

Secrets and credentials live in `.env` (gitignored). Never commit `.env`, `credentials.json`, or any `*.pem`/`*.key` files.
