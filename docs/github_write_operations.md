# GitHub Tool Write Operations Documentation

## Overview

The GitHub Tool has been extended with comprehensive write operations that allow you to modify repositories, manage branches, and handle issues programmatically. These operations use the official GitHub API through the `@octokit/rest` SDK.

## Authentication Requirements

All write operations require a GitHub Personal Access Token with appropriate permissions:

- **Fine-grained tokens** (recommended): Require "Contents" repository permissions (write access)
- **Classic tokens**: Require `repo` scope for private repositories or `public_repo` for public repositories
- **Special permissions**: Some file operations in `.github/workflows` directory also require "Workflows" permissions

## Available Write Operations

### File Management Operations

#### 1. Create File (`createFile`)
Creates a new file in the repository.

**Parameters:**
- `action`: `"createFile"`
- `owner`: Repository owner (username or organization)
- `repo`: Repository name
- `path`: File path (e.g., `"src/index.js"`, `"README.md"`)
- `content`: File content (string)
- `message`: Commit message (optional, defaults to `"Create {path}"`)
- `branch`: Target branch (optional, defaults to repository's default branch)

**Example:**
```javascript
{
  action: "createFile",
  owner: "username",
  repo: "my-repo",
  path: "src/hello.js",
  content: "console.log('Hello, World!');",
  message: "Add hello world script",
  branch: "main"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File created successfully",
  "file": {
    "path": "src/hello.js",
    "sha": "abc123...",
    "size": 29,
    "html_url": "https://github.com/username/my-repo/blob/main/src/hello.js",
    "download_url": "https://raw.githubusercontent.com/..."
  },
  "commit": {
    "sha": "def456...",
    "message": "Add hello world script",
    "author": {...},
    "committer": {...},
    "html_url": "https://github.com/username/my-repo/commit/def456..."
  }
}
```

#### 2. Update File (`updateFile`)
Updates an existing file in the repository.

**Parameters:**
- `action`: `"updateFile"`
- `owner`: Repository owner
- `repo`: Repository name
- `path`: File path
- `content`: New file content
- `message`: Commit message (optional, defaults to `"Update {path}"`)
- `sha`: File's current SHA (optional, will be retrieved if not provided)

**Example:**
```javascript
{
  action: "updateFile",
  owner: "username",
  repo: "my-repo",
  path: "README.md",
  content: "# Updated README\nThis is the new content.",
  message: "Update README with new information"
}
```

#### 3. Delete File (`deleteFile`)
Deletes a file from the repository.

**Parameters:**
- `action`: `"deleteFile"`
- `owner`: Repository owner
- `repo`: Repository name
- `path`: File path
- `sha`: File's current SHA (optional, will be retrieved if not provided)
- `message`: Commit message (optional, defaults to `"Delete {path}"`)

**Example:**
```javascript
{
  action: "deleteFile",
  owner: "username",
  repo: "my-repo",
  path: "old-file.txt",
  message: "Remove obsolete file"
}
```

### Branch Management Operations

#### 4. Create Branch (`createBranch`)
Creates a new branch from an existing branch.

**Parameters:**
- `action`: `"createBranch"`
- `owner`: Repository owner
- `repo`: Repository name
- `branch`: New branch name
- `source_branch`: Source branch to create from (optional, defaults to repository's default branch)

**Example:**
```javascript
{
  action: "createBranch",
  owner: "username",
  repo: "my-repo",
  branch: "feature-new-feature",
  source_branch: "main"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Branch created successfully",
  "branch": {
    "name": "feature-new-feature",
    "ref": "refs/heads/feature-new-feature",
    "sha": "abc123...",
    "url": "https://api.github.com/repos/username/my-repo/git/refs/heads/feature-new-feature"
  }
}
```

#### 5. Delete Branch (`deleteBranch`)
Deletes a branch from the repository.

**Parameters:**
- `action`: `"deleteBranch"`
- `owner`: Repository owner
- `repo`: Repository name
- `branch`: Branch name to delete

**Example:**
```javascript
{
  action: "deleteBranch",
  owner: "username",
  repo: "my-repo",
  branch: "old-feature-branch"
}
```

### Issues Management Operations

#### 6. Create Issue (`createIssue`)
Creates a new issue in the repository.

**Parameters:**
- `action`: `"createIssue"`
- `owner`: Repository owner
- `repo`: Repository name
- `title`: Issue title
- `body`: Issue description (optional)
- `assignees`: Array of usernames to assign (optional)
- `labels`: Array of label names (optional)
- `milestone`: Milestone number (optional)

**Example:**
```javascript
{
  action: "createIssue",
  owner: "username",
  repo: "my-repo",
  title: "Bug: Application crashes on startup",
  body: "The application crashes immediately after startup with the following error: ...",
  assignees: ["username", "collaborator"],
  labels: ["bug", "high-priority"],
  milestone: 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Issue created successfully",
  "issue": {
    "number": 42,
    "title": "Bug: Application crashes on startup",
    "body": "The application crashes immediately...",
    "state": "open",
    "user": "username",
    "assignees": ["username", "collaborator"],
    "labels": [
      {"name": "bug", "color": "d73a4a"},
      {"name": "high-priority", "color": "b60205"}
    ],
    "milestone": "v1.0",
    "created_at": "2023-01-01T12:00:00Z",
    "updated_at": "2023-01-01T12:00:00Z",
    "html_url": "https://github.com/username/my-repo/issues/42",
    "comments": 0
  }
}
```

#### 7. Update Issue (`updateIssue`)
Updates an existing issue.

**Parameters:**
- `action`: `"updateIssue"`
- `owner`: Repository owner
- `repo`: Repository name
- `issue_number`: Issue number to update
- `title`: New title (optional)
- `body`: New description (optional)
- `assignees`: New assignees array (optional)
- `labels`: New labels array (optional)
- `milestone`: New milestone number (optional)

**Example:**
```javascript
{
  action: "updateIssue",
  owner: "username",
  repo: "my-repo",
  issue_number: 42,
  title: "Bug: Application crashes on startup - RESOLVED",
  labels: ["bug", "resolved"]
}
```

#### 8. Close Issue (`closeIssue`)
Closes an open issue.

**Parameters:**
- `action`: `"closeIssue"`
- `owner`: Repository owner
- `repo`: Repository name
- `issue_number`: Issue number to close

**Example:**
```javascript
{
  action: "closeIssue",
  owner: "username",
  repo: "my-repo",
  issue_number: 42
}
```

## Error Handling

All write operations include comprehensive error handling:

- **401 Unauthorized**: Invalid or missing GitHub token
- **403 Forbidden**: Insufficient permissions for the operation
- **404 Not Found**: Repository, file, branch, or issue not found
- **409 Conflict**: Resource already exists (e.g., creating duplicate branch)
- **422 Unprocessable Entity**: Invalid parameters or validation errors

**Example error response:**
```json
{
  "error": true,
  "message": "Validation Failed: Path `invalid/path` is not a valid file path",
  "status": 422
}
```

## Best Practices

### Security
1. **Use Fine-grained Tokens**: Prefer fine-grained personal access tokens over classic tokens for better security
2. **Minimal Permissions**: Grant only the minimum required permissions
3. **Token Management**: Store tokens securely and rotate them regularly

### File Operations
1. **Content Encoding**: Content is automatically Base64 encoded for you
2. **SHA Management**: SHAs are automatically retrieved when not provided
3. **Commit Messages**: Provide meaningful commit messages for better project history

### Branch Operations
1. **Branch Naming**: Use descriptive branch names following your team's conventions
2. **Source Branch**: Always specify a source branch for clarity
3. **Cleanup**: Delete merged branches to keep repository clean

### Issues Management
1. **Descriptive Titles**: Use clear, descriptive issue titles
2. **Labels**: Use consistent labeling for better organization
3. **Assignments**: Assign issues appropriately for accountability

## Integration Examples

### Automated File Updates
```javascript
// Update version file and create release branch
const githubTool = new GitHubTool({ GITHUB_TOKEN: process.env.GITHUB_TOKEN });

// Update version file
await githubTool._call({
  action: "updateFile",
  owner: "myorg",
  repo: "myapp",
  path: "package.json",
  content: JSON.stringify({version: "1.2.0"}, null, 2),
  message: "Bump version to 1.2.0"
});

// Create release branch
await githubTool._call({
  action: "createBranch",
  owner: "myorg",
  repo: "myapp",
  branch: "release-1.2.0",
  source_branch: "main"
});
```

### Issue Automation
```javascript
// Create bug report from error logs
await githubTool._call({
  action: "createIssue",
  owner: "myorg",
  repo: "myapp",
  title: `Bug: ${errorType} in ${moduleName}`,
  body: `Error details:\n\`\`\`\n${errorLog}\n\`\`\``,
  labels: ["bug", "auto-generated"],
  assignees: ["maintainer"]
});
```

## Conclusion

These write operations provide comprehensive GitHub repository management capabilities, enabling automated workflows, content management, and issue tracking. Always ensure proper authentication and permissions are in place before using these operations in production environments. 