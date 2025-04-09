# About this Fork

This fork is a personal project to add a few features to LibreChat and integrate features from other forks.

[![ESLint Code Quality Checks](https://github.com/jmaddington/LibreChat/actions/workflows/eslint-ci.yml/badge.svg)](https://github.com/jmaddington/LibreChat/actions/workflows/eslint-ci.yml)
[![Backend Unit Tests](https://github.com/jmaddington/LibreChat/actions/workflows/backend-review.yml/badge.svg)](https://github.com/jmaddington/LibreChat/actions/workflows/backend-review.yml)
[![Frontend Unit Tests](https://github.com/jmaddington/LibreChat/actions/workflows/frontend-review.yml/badge.svg)](https://github.com/jmaddington/LibreChat/actions/workflows/frontend-review.yml)
[![Accessibility Tests](https://github.com/jmaddington/LibreChat/actions/workflows/a11y.yml/badge.svg)](https://github.com/jmaddington/LibreChat/actions/workflows/a11y.yml)
[![Docker Build and Push to GHCR](https://github.com/jmaddington/LibreChat/actions/workflows/deploy-jm.yml/badge.svg)](https://github.com/jmaddington/LibreChat/actions/workflows/deploy-jm.yml)
<!-- Docker Build Only badge will appear after first workflow run -->
[![Docker Build Only](https://img.shields.io/badge/Docker%20Build%20Only-Ready-blue)](https://github.com/jmaddington/LibreChat/actions/workflows/deploy-jm-build-only.yml)

## Branches
`main` - The main branch for this fork for production use. Stable-ish, but has been at least minimally tested.
`main-upstream` - A clone of the upstream main branch.
`tracking/YYYY/MM/DD-XX` - Tracking branches for specific merges from upstream, with date and sequence number.
`new/feature/X` - Branches for new features, kept open until they are feature complete and merged.

## Known Changes from danny-avila/LibreChat
- E2B.dev code interpreter added to the tools list
- Web Navigator plugin added to the tools list.
- QuickChart plugin added to the tools list.
- TimeAPI.io plugin added to the tools list.
- ✅ MERGED UPSTREAM - OpenWeather - Weather plugin added to the tools list.
- ✅ MERGED UPSTREAM - Flux AI plugin added to the tools list.


### Why E2B?
LibreChat recently introduced their own code interpreter service. It's affordable, integrates seamlessly with their platform, and provides a viable revenue stream. So why not use it?

For our internal needs, however, we require a code interpreter with network access—a feature not offered by LibreChat's interpreter for safety reasons. E2B.dev provides an excellent alternative that meets our specific requirements.

***WE STILL LOVE LIBRECHAT!*** In fact, we're proud to be monthly sponsors. Our choice to use E2B.dev is not about detracting from LibreChat's service; we simply need additional functionality to fulfill our unique needs.