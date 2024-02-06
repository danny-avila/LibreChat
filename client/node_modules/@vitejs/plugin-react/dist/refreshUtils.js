function debounce(fn, delay) {
  let handle
  return () => {
    clearTimeout(handle)
    handle = setTimeout(fn, delay)
  }
}

/* eslint-disable no-undef */
const enqueueUpdate = debounce(exports.performReactRefresh, 16)

// Taken from https://github.com/pmmmwh/react-refresh-webpack-plugin/blob/main/lib/runtime/RefreshUtils.js#L141
// This allows to resister components not detected by SWC like styled component
function registerExportsForReactRefresh(filename, moduleExports) {
  for (const key in moduleExports) {
    if (key === '__esModule') continue
    const exportValue = moduleExports[key]
    if (exports.isLikelyComponentType(exportValue)) {
      // 'export' is required to avoid key collision when renamed exports that
      // shadow a local component name: https://github.com/vitejs/vite-plugin-react/issues/116
      // The register function has an identity check to not register twice the same component,
      // so this is safe to not used the same key here.
      exports.register(exportValue, filename + ' export ' + key)
    }
  }
}

function validateRefreshBoundaryAndEnqueueUpdate(prevExports, nextExports) {
  if (!predicateOnExport(prevExports, (key) => key in nextExports)) {
    return 'Could not Fast Refresh (export removed)'
  }
  if (!predicateOnExport(nextExports, (key) => key in prevExports)) {
    return 'Could not Fast Refresh (new export)'
  }

  let hasExports = false
  const allExportsAreComponentsOrUnchanged = predicateOnExport(
    nextExports,
    (key, value) => {
      hasExports = true
      if (exports.isLikelyComponentType(value)) return true
      return prevExports[key] === nextExports[key]
    },
  )
  if (hasExports && allExportsAreComponentsOrUnchanged) {
    enqueueUpdate()
  } else {
    return 'Could not Fast Refresh. Learn more at https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports'
  }
}

function predicateOnExport(moduleExports, predicate) {
  for (const key in moduleExports) {
    if (key === '__esModule') continue
    const desc = Object.getOwnPropertyDescriptor(moduleExports, key)
    if (desc && desc.get) return false
    if (!predicate(key, moduleExports[key])) return false
  }
  return true
}

// Hides vite-ignored dynamic import so that Vite can skip analysis if no other
// dynamic import is present (https://github.com/vitejs/vite/pull/12732)
function __hmr_import(module) {
  return import(/* @vite-ignore */ module)
}

exports.__hmr_import = __hmr_import
exports.registerExportsForReactRefresh = registerExportsForReactRefresh
exports.validateRefreshBoundaryAndEnqueueUpdate =
  validateRefreshBoundaryAndEnqueueUpdate
