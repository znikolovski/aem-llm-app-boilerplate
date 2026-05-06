/**
 * App Builder `deploy-static` hook (see app.config.yaml).
 *
 * Default `@adobe/aio-lib-web` `deployWeb` calls `emptyFolder` on the **entire** Runtime namespace prefix
 * (`config.s3.folder`, i.e. workspace static bucket root). Every `aio app deploy` from **any** app in that
 * workspace therefore deletes **all** previously uploaded static objects — including another app’s
 * `/<other-package>/` tree — then uploads only the current app. That is why deploying SecurBank 404’d Frescopa.
 *
 * This hook replaces that step when we have a **namespaced** web build (`web-prod/<package>/index.html`):
 * it empties **only** `namespace/<package>/` and uploads the dist tree (same keys as default uploadDir).
 *
 * Return **`true`** so the CLI skips the built-in `deployWeb` for this extension.
 *
 * @param {object} config aio merged app config
 * @returns {Promise<boolean>} true = skip default deploy
 */
const fs = require('fs')
const path = require('node:path')
const { resolveOpenwhiskPackageKey } = require('./lib/openwhisk-runtime-package.cjs')

function loadAioLibWeb () {
  try {
    const root = path.dirname(require.resolve('@adobe/aio-lib-web/package.json'))
    return {
      RemoteStorage: require(path.join(root, 'lib', 'remote-storage.js')),
      getS3Credentials: require(path.join(root, 'lib', 'getS3Creds.js'))
    }
  } catch (e) {
    console.warn(
      '[aio-deploy-static-scoped] @adobe/aio-lib-web not found (npm install @adobe/aio-lib-web). Falling back to default deploy:',
      e instanceof Error ? e.message : e
    )
    return null
  }
}

module.exports = async function aioDeployStaticScoped (config) {
  const dist = config?.web?.distProd
  const ns = config?.s3?.folder
  if (!dist || typeof dist !== 'string' || !ns || typeof ns !== 'string') {
    return false
  }

  const atRoot =
    process.env.LLM_STATIC_WEB_AT_ROOT === '1' ||
    /^true$/i.test(String(process.env.LLM_STATIC_WEB_AT_ROOT || ''))
  if (atRoot) {
    console.log('[aio-deploy-static-scoped] LLM_STATIC_WEB_AT_ROOT — using default deploy (single app at CDN /).')
    return false
  }

  const pkg = resolveOpenwhiskPackageKey(config)
  if (!pkg) {
    console.log('[aio-deploy-static-scoped] No OpenWhisk package key — using default deploy.')
    return false
  }

  const nestedIndex = path.join(dist, pkg, 'index.html')
  if (!fs.existsSync(nestedIndex)) {
    console.warn(
      '[aio-deploy-static-scoped] Missing namespaced build',
      nestedIndex,
      '— using default deploy (WARNING: may delete sibling apps in the same workspace namespace).'
    )
    return false
  }

  const lib = loadAioLibWeb()
  if (!lib) return false

  const namespace = String(ns).replace(/\/+$/, '')
  const scopedPrefix = `${namespace}/${pkg}/`

  const creds = await lib.getS3Credentials(config)
  const remoteStorage = new lib.RemoteStorage(creds)

  if (await remoteStorage.folderExists(scopedPrefix)) {
    await remoteStorage.emptyFolder(scopedPrefix)
  }
  await remoteStorage.uploadDir(dist, namespace, config, (f) => {
    if (process.env.AIO_VERBOSE_DEPLOY) {
      console.log('[aio-deploy-static-scoped]', path.relative(dist, f))
    }
  })

  console.log(`[aio-deploy-static-scoped] CDN updated at …/${namespace}/${pkg}/ (sibling app prefixes preserved).`)
  return true
}
