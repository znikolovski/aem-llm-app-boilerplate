/**
 * First OpenWhisk package key under `application.runtimeManifest.packages` in `app.config.yaml`
 * (same rule as `scripts/sync-web-actions-base.mjs`). Used by aio CLI hooks that need the CDN path segment.
 */
const fs = require('fs')
const path = require('node:path')

function extractFirstRuntimePackageKeyFromYaml (text) {
  const lines = text.split(/\r?\n/)
  let packagesIndent = -1
  let seenPackages = false
  for (const line of lines) {
    const m = /^(\s*)packages:\s*(#.*)?$/.exec(line)
    if (m) {
      seenPackages = true
      packagesIndent = m[1].length
      continue
    }
    if (!seenPackages) continue
    if (!line.trim() || /^\s*#/.test(line)) continue
    const keyM = /^(\s*)([a-zA-Z0-9_.-]+):\s*(#.*)?$/.exec(line)
    if (!keyM) continue
    const indent = keyM[1].length
    if (indent <= packagesIndent) break
    return keyM[2]
  }
  return ''
}

/**
 * @param {object} [config] aio merged app config (may include manifest.full.packages)
 * @returns {string} package key or ""
 */
function resolveOpenwhiskPackageKey (config) {
  const pkgs = config?.manifest?.full?.packages
  if (pkgs && typeof pkgs === 'object') {
    const keys = Object.keys(pkgs).filter((k) => k && k !== '__APP_PACKAGE__')
    if (keys.length >= 1) return keys[0]
  }
  try {
    const yamlPath = path.join(process.cwd(), 'app.config.yaml')
    const text = fs.readFileSync(yamlPath, 'utf8')
    return extractFirstRuntimePackageKeyFromYaml(text)
  } catch {
    return ''
  }
}

module.exports = { resolveOpenwhiskPackageKey, extractFirstRuntimePackageKeyFromYaml }
