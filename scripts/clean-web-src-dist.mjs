#!/usr/bin/env node
/**
 * Remove accidental web-src/dist (stale HTML/CSS from a prior Parcel run into the wrong directory).
 * aio app dev passes a glob of HTML files under web-src to Parcel; a nested web-src/dist/index.html
 * becomes a second entry and breaks resolution (e.g. Failed to resolve absolute CSS from that file).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "web-src", "dist");

try {
  fs.rmSync(target, { recursive: true, force: true });
} catch {
  /* ignore */
}
