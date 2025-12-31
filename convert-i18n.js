#!/usr/bin/env node
/**
 * Convert i18n JSON:
 *   OLD: { "en": { "k1": "..." }, "ko": { "k1": "..." }, ... }
 *   NEW: { "k1": { "en": "...", "ko": "...", "ja": "...", "zh": "..." }, ... }
 *
 * Usage:
 *   node convert-i18n.js input.json output.json
 *   node convert-i18n.js input.json output.json --langs=en,ko,ja,zh --sort
 */

const fs = require("fs");

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--langs=")) args.langs = a.split("=", 2)[1];
    else if (a === "--sort") args.sort = true;
    else args._.push(a);
  }
  return args;
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function convertOldToNew(oldJson, supportedLangs) {
  if (!isPlainObject(oldJson)) {
    throw new Error("Input JSON must be an object.");
  }

  // Detect "old shape": top-level keys are languages mapping to {key:value}
  // We'll treat any top-level key that has an object value as a "lang pack".
  const langPacks = {};
  for (const lang of Object.keys(oldJson)) {
    if (isPlainObject(oldJson[lang])) {
      langPacks[lang] = oldJson[lang];
    }
  }

  if (Object.keys(langPacks).length === 0) {
    throw new Error(
      "No language packs found. Expected old shape like { en:{...}, ko:{...} }"
    );
  }

  // Use either provided langs or union of detected langs
  const langs = supportedLangs?.length
    ? supportedLangs
    : Object.keys(langPacks);

  // Collect all keys from all language packs
  const allKeys = new Set();
  for (const lang of Object.keys(langPacks)) {
    for (const k of Object.keys(langPacks[lang])) allKeys.add(k);
  }

  // Build new structure
  const out = {};
  for (const key of allKeys) {
    const entry = {};
    for (const lang of langs) {
      const pack = langPacks[lang];
      // Preserve empty strings; only missing stays undefined (we'll set to "" for consistency)
      const v =
        pack && Object.prototype.hasOwnProperty.call(pack, key)
          ? pack[key]
          : "";
      entry[lang] = v;
    }
    out[key] = entry;
  }

  return out;
}

function stableSortObject(obj) {
  const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
  const out = {};
  for (const k of keys) {
    const v = obj[k];
    if (isPlainObject(v)) {
      // sort language keys inside too
      const innerKeys = Object.keys(v).sort((a, b) => a.localeCompare(b));
      const inner = {};
      for (const ik of innerKeys) inner[ik] = v[ik];
      out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return out;
}

(function main() {
  const args = parseArgs(process.argv);
  const [inputPath, outputPath] = args._;

  if (!inputPath || !outputPath) {
    console.error(
      "Usage: node convert-i18n.js input.json output.json [--langs=en,ko,ja,zh] [--sort]"
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const oldJson = JSON.parse(raw);

  const langs = args.langs
    ? args.langs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  let converted = convertOldToNew(oldJson, langs);

  if (args.sort) converted = stableSortObject(converted);

  fs.writeFileSync(
    outputPath,
    JSON.stringify(converted, null, 2) + "\n",
    "utf8"
  );
  console.log(`✅ Converted ${inputPath} -> ${outputPath}`);
})();
