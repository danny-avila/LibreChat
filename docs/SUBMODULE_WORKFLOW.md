# Documentation Submodule Workflow Guide

This guide explains how LibreChat integrates its documentation as a git submodule and provides workflows for contributors.

## 📖 Overview

LibreChat's documentation is maintained in a separate repository and included as a git submodule at `docs-site/`. This approach provides:

- ✅ **Synchronized updates**: Documentation can be updated alongside code changes
- ✅ **Independent contributions**: Docs can be updated without touching the main codebase
- ✅ **Local preview**: Run the documentation site locally during development
- ✅ **Version control**: Track which documentation version corresponds to each code version
- ✅ **Flexible workflows**: Support both combined and separate contributions

## 🚀 Getting Started

### Initial Setup

When cloning LibreChat for the first time:

```bash
# Clone with submodules included
git clone --recurse-submodules https://github.com/danny-avila/LibreChat.git
cd LibreChat
```

If you already cloned without the `--recurse-submodules` flag:

```bash
cd LibreChat
git submodule update --init --recursive
```

### Verifying Submodule Status

Check if your documentation submodule is up-to-date:

```bash
# Run the automated check
npm run check:docs

# Or manually check submodule status
cd docs-site
git fetch origin
git status
```

## 🔄 Common Workflows

### Workflow 1: Code Change with Documentation Update

Use this when your code changes require documentation updates:

```bash
# 1. Create feature branch in main repo
git checkout -b feat/my-new-feature

# 2. Make code changes in main repo
# Edit your files...

# 3. Navigate to docs submodule
cd docs-site

# 4. Create docs branch
git checkout -b docs/my-new-feature

# 5. Update documentation
# Edit documentation files...

# 6. Commit docs changes
git add .
git commit -m "docs: Document new feature X"
git push origin docs/my-new-feature

# 7. Return to main repo
cd ..

# 8. Update submodule reference
git add docs-site

# 9. Commit everything together
git add .
git commit -m "feat: Add new feature X with documentation"

# 10. Push main repo changes
git push origin feat/my-new-feature
```

### Workflow 2: Documentation-Only Update

For typo fixes, clarifications, or new guides:

**Option A: Direct contribution to docs repo (Recommended)**
```bash
# Clone the documentation repository directly
git clone https://github.com/LibreChat-AI/librechat.ai.git
cd librechat.ai

# Make your changes
# Edit files...

# Commit and create PR in docs repo
git checkout -b docs/fix-typo
git commit -m "docs: Fix typo in installation guide"
git push origin docs/fix-typo
```

**Option B: Through the submodule**
```bash
# Navigate to submodule
cd LibreChat/docs-site

# Create branch
git checkout -b docs/update-guides

# Make changes
# Edit files...

# Commit and push
git commit -am "docs: Update installation guide"
git push origin docs/update-guides

# Update main repo to point to new commit
cd ..
git add docs-site
git commit -m "docs: Update documentation submodule"
git push
```

### Workflow 3: Updating to Latest Documentation

Pull in the latest documentation changes:

```bash
# Update submodule to latest remote commit
git submodule update --remote docs-site

# Stage the submodule update
git add docs-site

# Commit the update
git commit -m "docs: Update documentation submodule to latest"

# Push to your branch
git push
```

## 🔍 Automated Checks & Workflows

LibreChat includes several automated tools to keep documentation in sync:

### 1. Developer Warnings (Local)

When running development or build commands, you'll see warnings if docs are outdated:

```bash
npm run backend:dev
# or
npm run frontend:dev
```

Output example:
```
⚠️  Documentation submodule is 5 commits behind
    Run: git submodule update --remote docs-site
```

Skip the check temporarily:
```bash
SKIP_DOCS_CHECK=true npm run backend:dev
```

### 2. GitHub Actions: Weekly Updates

A GitHub Action runs weekly to check for documentation updates and creates PRs automatically:

- **Schedule**: Every Monday at 9:00 AM UTC
- **Trigger**: Can also be manually triggered or triggered by docs repo updates
- **Action**: Creates a PR with latest docs changes

### 3. GitHub Actions: PR Documentation Check

When you open a PR that modifies certain files, a bot will comment if documentation might need attention:

**Triggers on changes to:**
- `api/**`
- `client/src/**`
- `packages/**`
- `librechat.example.yaml`
- `.env.example`

**The bot checks:**
- Whether docs were updated in the PR
- How long since docs were last updated
- If configuration/API files were modified

## 🛠️ Advanced Usage

### Previewing Documentation Locally

Run the documentation site during development:

```bash
cd docs-site

# Install dependencies (first time only)
npm install

# Start development server
npm run dev

# Documentation will be available at http://localhost:3000
```

### Working on a Specific Docs Version

Checkout a specific commit or branch in the submodule:

```bash
cd docs-site

# Checkout specific branch
git checkout stable-docs

# Or specific commit
git checkout abc123

cd ..

# Commit the change
git add docs-site
git commit -m "docs: Pin to stable documentation version"
```

### Resolving Submodule Conflicts

If you encounter submodule conflicts during merge/rebase:

```bash
# Accept the incoming submodule pointer
git checkout --theirs docs-site
git add docs-site

# Or accept your version
git checkout --ours docs-site
git add docs-site

# Or manually resolve
cd docs-site
git checkout <desired-commit>
cd ..
git add docs-site
```

## 📋 Best Practices

1. **Keep synchronized**: Update docs alongside code changes in the same PR
2. **Meaningful commits**: Use clear commit messages for both code and docs
3. **Test locally**: Preview documentation changes before submitting
4. **Link to docs**: Reference specific documentation pages in PR descriptions
5. **Check status regularly**: Run `npm run check:docs` periodically
6. **Small, focused changes**: Keep documentation PRs focused and reviewable

## 🆘 Troubleshooting

### "Submodule not initialized"

```bash
git submodule update --init --recursive
```

### "Detached HEAD in submodule"

This is normal for submodules. To make changes:

```bash
cd docs-site
git checkout -b my-branch
# Make changes...
```

### "Permission denied" when pushing submodule

Ensure you have push access to the documentation repository, or fork it and update the submodule URL:

```bash
cd docs-site
git remote set-url origin https://github.com/YOUR_USERNAME/librechat.ai.git
```

### "Documentation check failing in CI"

The check is informational only. Review if docs need updating, or add a comment in your PR explaining why documentation changes aren't needed.

## 📚 Additional Resources

- [Git Submodules Documentation](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [LibreChat Contributing Guidelines](../.github/CONTRIBUTING.md)
- [LibreChat Documentation Site](https://docs.librechat.ai)

## 💡 Tips

- Use `git status` in both the main repo and submodule to track changes
- The submodule is a separate git repository with its own history
- Changes in the submodule need to be committed in both the submodule and main repo
- The main repo stores a pointer to a specific commit in the submodule
- Always pull/update submodules after pulling main repo changes

---

**Questions or issues?** Join our [Discord community](https://discord.librechat.ai) or open an issue on GitHub.
