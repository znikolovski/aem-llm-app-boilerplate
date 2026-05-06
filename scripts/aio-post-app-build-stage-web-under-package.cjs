/**
 * App Builder `post-app-build` hook (see app.config.yaml).
 *
 * `@adobe/aio-lib-web` forces Parcel `distDir` to `config.web.distProd` (e.g. dist/application/web-prod)
 * and builds with the Parcel target name **`webassets`**, which does not use **`targets.default.publicUrl`**
 * (sync sets **`targets.webassets.publicUrl`** to match). Older builds could emit **`/web-src.*.(js|css)`** at the
 * **origin root**. This hook:
 * 1. Moves flat Parcel output into `web-prod/<package>/` (CDN path matches Router basename).
 * 2. Rewrites those root-absolute asset URLs to `/<package>/web-src.*` if still present (backstop when
 *    `targets.webassets.publicUrl` was missing from `web-src/package.json`).
 *
 * @param {object} config aio-cli merged app config (includes web.distProd, manifest)
 * @returns {Promise<void>}
 */
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('node:path')
const { resolveOpenwhiskPackageKey } = require('./lib/openwhisk-runtime-package.cjs')

/**
 * aio-lib-web Parcel output often uses `src=/web-src.HASH.js` (no `publicUrl` prefix). After nesting
 * under `/<package>/`, rewrite so the browser requests `/<package>/web-src.HASH.js`.
 * Idempotent if URLs already include `/<package>/`.
 *
 * @param {string} indexPath
 * @param {string} pkg
 */
async function rewriteIndexHtmlRootAssets (indexPath, pkg) {
  let html = await fsp.readFile(indexPath, 'utf8')
  const re = /(\b(?:src|href)\s*=\s*)(["']?)(\/web-src\.[^"'>\s]+)/gi
  const next = html.replace(re, (full, p1, q, url) => {
    if (url.startsWith(`/${pkg}/`)) return full
    return `${p1}${q}/${pkg}${url}`
  })
  if (next !== html) {
    await fsp.writeFile(indexPath, next, 'utf8')
  }
}

module.exports = async function aioPostAppBuildStageWebUnderPackage (config) {
  const atRoot =
    process.env.LLM_STATIC_WEB_AT_ROOT === '1' ||
    /^true$/i.test(String(process.env.LLM_STATIC_WEB_AT_ROOT || ''))
  if (atRoot) return

  const distProd = config?.web?.distProd
  if (!distProd || typeof distProd !== 'string') return

  const pkg = resolveOpenwhiskPackageKey(config)
  if (!pkg) return

  const inner = path.join(distProd, pkg)
  const flatIndex = path.join(distProd, 'index.html')
  const nestedIndex = path.join(inner, 'index.html')

  if (fs.existsSync(flatIndex) && !fs.existsSync(nestedIndex)) {
    await fsp.mkdir(inner, { recursive: true })
    const names = await fsp.readdir(distProd)
    for (const name of names) {
      if (name === pkg) continue
      await fsp.rename(path.join(distProd, name), path.join(inner, name))
    }
  }

  if (fs.existsSync(nestedIndex)) {
    await rewriteIndexHtmlRootAssets(nestedIndex, pkg)
  }
}
