import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SNAPSHOT_PATH = path.resolve(".github/state-watch-snapshot.json");
const TARGETS_PATH = path.resolve("scripts/state-watch-targets.ts");

function extractTargetsFromTs(source) {
  const match = source.match(/export const stateWatchTargets[^=]*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) {
    throw new Error("Could not parse stateWatchTargets from scripts/state-watch-targets.ts");
  }
  const objectLiteral = match[1].replace(/as const/g, "");
  return Function(`"use strict"; return (${objectLiteral});`)();
}

function normalizeText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/ /gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function run() {
  const tsSource = fs.readFileSync(TARGETS_PATH, "utf8");
  const targets = extractTargetsFromTs(tsSource);

  let previous = {};
  if (fs.existsSync(SNAPSHOT_PATH)) {
    previous = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
  }

  const next = {};
  const changed = [];
  const errors = [];

  for (const target of targets) {
    const prevEntry = previous[target.id] ?? null;
    try {
      const res = await fetch(target.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "AutoGrant-State-Monitor/1.0" },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const html = await res.text();
      const hash = sha256(normalizeText(html));
      const hasChanged = prevEntry !== null && prevEntry.hash !== hash;

      next[target.id] = {
        state: target.state,
        label: target.label,
        url: target.url,
        hash,
        lastChecked: new Date().toISOString(),
        lastChangedAt: hasChanged ? new Date().toISOString() : prevEntry?.lastChangedAt ?? null,
        status: "ok",
      };

      if (hasChanged) {
        changed.push(target);
      }
    } catch (err) {
      errors.push({ target, message: err instanceof Error ? err.message : String(err) });
      next[target.id] = {
        ...(prevEntry ?? {
          state: target.state,
          label: target.label,
          url: target.url,
          hash: null,
          lastChangedAt: null,
        }),
        lastChecked: new Date().toISOString(),
        status: "error",
      };
    }
  }

  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  console.log(`Checked ${targets.length} TN/IA targets. Changed: ${changed.length}, Errors: ${errors.length}`);
  for (const item of changed) {
    console.log(`CHANGED [${item.state}] ${item.label}: ${item.url}`);
  }
  for (const item of errors) {
    console.log(`ERROR [${item.target.state}] ${item.target.label}: ${item.message}`);
  }
}

run();
