#!/usr/bin/env bash
# Auto-restarting `next dev` supervisor.
#
# Why this exists: the video render pipeline (lib/video/render.ts) drives a
# real headless Chromium instance frame-by-frame inside the SAME Node
# process as the Next.js dev server (lib/video/jobs.ts runs renders
# in-process — see its own doc comment on that tradeoff). On a heavily
# loaded dev machine, transient host memory pressure from OTHER
# applications can cause the OS to kill the whole process outright — a
# hard kill that bypasses every try/catch and Promise rejection handler in
# the codebase, taking the entire dev server down mid-render (observed
# directly while pre-warming a demo lesson: `next dev` vanished mid-render
# with no JS-catchable error, no core dump, and no crash report — the
# signature of a memory-pressure kill, not an app bug). A single crashed
# render should degrade to "that job failed, retry it" — not "the whole
# app is down until someone notices and restarts it."
#
# This script is the stopgap: it keeps `next dev` itself self-healing by
# restarting it automatically if it ever exits unexpectedly, so a demo (or
# any other caller) can retry a failed render against a server that's back
# up within seconds, without manual intervention. It does NOT fix the
# underlying single-process render architecture — the durable fix there is
# to move rendering into a supervised child process (see docs/VIDEO.md);
# this script only prevents one bad render from taking down dev indefinitely.
set -uo pipefail

PORT_ARG="${PORT:-3000}"
echo "[dev-with-restart] starting next dev on port ${PORT_ARG} (auto-restarts on crash)"

while true; do
  PORT="$PORT_ARG" npm run dev
  code=$?
  if [ "$code" -eq 0 ]; then
    echo "[dev-with-restart] next dev exited cleanly (code 0) — not restarting."
    break
  fi
  echo "[dev-with-restart] next dev exited unexpectedly (code $code) — restarting in 1s..."
  sleep 1
done
