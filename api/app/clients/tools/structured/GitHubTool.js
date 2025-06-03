// Логирование для отладки загрузки
const loadTime = new Date().toISOString();
console.log(`GitHubTool: Loading module... [${loadTime}]`);

const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { Octokit } = require('@octokit/rest');

class GitHubTool extends Tool {
  static lc_name() {
    return 'github-tool';
  }

  static forAgents = true;

  constructor(fields = {}) {
    const constructorTime = new Date().toISOString();
    console.log(`GitHubTool: Constructor called at [${constructorTime}] with fields:`, JSON.stringify(fields, null, 2));
    super(fields);

    this.name = 'github-tool';
    this.description = 'Comprehensive tool for GitHub repository management with full read and write capabilities. Supports file operations (create, update, delete), branch management (create, delete), issues management (create, update, close), repository browsing, code search, and project analysis. Uses official GitHub API with @octokit/rest SDK. Supports both classic and fine-grained personal access tokens. Write operations require appropriate permissions.';

    // Получение API ключа из параметров (токен предоставляется пользователем)
    // Поддерживает как classic, так и fine-grained GitHub Personal Access Tokens
    // Рекомендуется использовать fine-grained tokens для повышенной безопасности
    this.githubToken = fields.GITHUB_TOKEN || 
                      fields.githubToken || 
                      fields.token ||
                      fields.apiKey;

    this.override = fields.override || false;

    // Проверка наличия токена
    if (!this.githubToken && !this.override) {
      console.error(`GitHubTool [${constructorTime}]: CRITICAL - GITHUB_TOKEN is REQUIRED...`);
    } else if (this.githubToken) {
      console.log(`GitHubTool [${constructorTime}]: GITHUB_TOKEN has been provided.`);
    } else if (this.override) {
      console.warn(`GitHubTool [${constructorTime}]: GITHUB_TOKEN is missing, but override is true...`);
    }

    // Инициализация Octokit
    if (this.githubToken) {
      this.octokit = new Octokit({
        auth: this.githubToken,
      });
    }

    // Определение схемы входных данных
    this.schema = z.object({
      action: z.enum([
        'getRepository',
        'getRepoStructure', 
        'getFileContent',
        'listBranches',
        'getCommits',
        'getReleases',
        'searchCode',
        'searchFiles',
        'listIssues',
        'getIssue',
        'listPullRequests',
        'getPullRequest',
        'analyzeProject',
        'getRepoStats',
        // File Management Operations
        'createFile',
        'updateFile',
        'deleteFile',
        // Branch Management Operations
        'createBranch',
        'deleteBranch',
        // Issues Management Operations
        'createIssue',
        'updateIssue',
        'closeIssue'
      ]).describe('The specific GitHub action to perform'),
      
      owner: z.string().describe('Repository owner (username or organization)'),
      repo: z.string().describe('Repository name'),
      
      // Опциональные параметры для разных действий
      path: z.string().optional().describe('File or directory path'),
      branch: z.string().optional().describe('Branch name (defaults to default branch)'),
      query: z.string().optional().describe('Search query for code or files'),
      issue_number: z.number().optional().describe('Issue number'),
      pull_number: z.number().optional().describe('Pull request number'),
      state: z.enum(['open', 'closed', 'all']).optional().describe('State filter for issues/PRs'),
      per_page: z.number().max(100).optional().describe('Number of results per page (max 100)'),
      page: z.number().optional().describe('Page number for pagination'),
      
      // Parameters for write operations
      content: z.string().optional().describe('File content for create/update operations'),
      message: z.string().optional().describe('Commit message for file operations'),
      sha: z.string().optional().describe('SHA of the file for update/delete operations'),
      source_branch: z.string().optional().describe('Source branch for creating new branch'),
      title: z.string().optional().describe('Title for issue operations'),
      body: z.string().optional().describe('Body/description for issue operations'),
      assignees: z.array(z.string()).optional().describe('Assignees for issue operations'),
      labels: z.array(z.string()).optional().describe('Labels for issue operations'),
      milestone: z.number().optional().describe('Milestone number for issue operations')
    }).describe('Input schema for GitHub operations');
    
    console.log(`GitHubTool [${constructorTime}]: Schema defined. Initialization complete.`);
  }

  async _call(input) {
    const callTime = new Date().toISOString();
    console.log(`GitHubTool [${callTime}]: _call invoked with input:`, JSON.stringify(input, null, 2));

    if (!this.octokit && !this.override) {
      const errorMsg = "GitHub token not configured. Please provide your GitHub Personal Access Token.";
      console.error(`GitHubTool [${callTime}]: ${errorMsg}`);
      return JSON.stringify({ error: true, message: errorMsg });
    }

    if (!this.octokit && this.override) {
      const errorMsg = "GitHub token not configured. Tool is in test mode. Please provide your GitHub Personal Access Token to use GitHub functionality.";
      console.error(`GitHubTool [${callTime}]: ${errorMsg}`);
      return JSON.stringify({ error: true, message: errorMsg });
    }

    try {
      const { action, owner, repo, ...params } = input;
      
      console.log(`GitHubTool [${callTime}]: Executing action '${action}' for ${owner}/${repo}`);

      switch (action) {
        case 'getRepository':
          return await this.getRepository(owner, repo);
        case 'getRepoStructure':
          return await this.getRepoStructure(owner, repo, params.path);
        case 'getFileContent':
          return await this.getFileContent(owner, repo, params.path, params.branch);
        case 'listBranches':
          return await this.listBranches(owner, repo);
        case 'getCommits':
          return await this.getCommits(owner, repo, params);
        case 'getReleases':
          return await this.getReleases(owner, repo);
        case 'searchCode':
          return await this.searchCode(owner, repo, params.query);
        case 'searchFiles':
          return await this.searchFiles(owner, repo, params.query);
        case 'listIssues':
          return await this.listIssues(owner, repo, params);
        case 'getIssue':
          return await this.getIssue(owner, repo, params.issue_number);
        case 'listPullRequests':
          return await this.listPullRequests(owner, repo, params);
        case 'getPullRequest':
          return await this.getPullRequest(owner, repo, params.pull_number);
        case 'analyzeProject':
          return await this.analyzeProject(owner, repo);
        case 'getRepoStats':
          return await this.getRepoStats(owner, repo);
        case 'createFile':
          return await this.createFile(owner, repo, params.path, params.content, params.message, params.branch);
        case 'updateFile':
          return await this.updateFile(owner, repo, params.path, params.content, params.message, params.sha);
        case 'deleteFile':
          return await this.deleteFile(owner, repo, params.path, params.sha, params.message);
        case 'createBranch':
          return await this.createBranch(owner, repo, params.source_branch, params.branch);
        case 'deleteBranch':
          return await this.deleteBranch(owner, repo, params.branch);
        case 'createIssue':
          return await this.createIssue(owner, repo, params.title, params.body, params.assignees, params.labels, params.milestone);
        case 'updateIssue':
          return await this.updateIssue(owner, repo, params.issue_number, params.title, params.body, params.assignees, params.labels, params.milestone);
        case 'closeIssue':
          return await this.closeIssue(owner, repo, params.issue_number);
        default:
          return JSON.stringify({ error: true, message: `Unknown action: ${action}` });
      }
    } catch (error) {
      console.error(`GitHubTool [${callTime}]: Error during execution:`, error);
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        action: input.action 
      });
    }
  }

  // === ОСНОВНЫЕ МЕТОДЫ ===

  async getRepository(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.get({ owner, repo });
      
      return JSON.stringify({
        success: true,
        repository: {
          name: data.name,
          full_name: data.full_name,
          description: data.description,
          private: data.private,
          html_url: data.html_url,
          clone_url: data.clone_url,
          default_branch: data.default_branch,
          language: data.language,
          languages_url: data.languages_url,
          size: data.size,
          stargazers_count: data.stargazers_count,
          watchers_count: data.watchers_count,
          forks_count: data.forks_count,
          open_issues_count: data.open_issues_count,
          created_at: data.created_at,
          updated_at: data.updated_at,
          pushed_at: data.pushed_at,
          topics: data.topics
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getRepoStructure(owner, repo, path = '') {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });

      const structure = Array.isArray(data) 
        ? data.map(item => ({
            name: item.name,
            path: item.path,
            type: item.type,
            size: item.size,
            download_url: item.download_url,
            html_url: item.html_url
          }))
        : {
            name: data.name,
            path: data.path,
            type: data.type,
            size: data.size,
            content: data.content ? Buffer.from(data.content, 'base64').toString() : null,
            download_url: data.download_url,
            html_url: data.html_url
          };

      return JSON.stringify({
        success: true,
        path: path || '/',
        contents: structure
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getFileContent(owner, repo, path, branch) {
    try {
      const params = { owner, repo, path };
      if (branch) params.ref = branch;

      const { data } = await this.octokit.rest.repos.getContent(params);

      if (data.type !== 'file') {
        return JSON.stringify({ 
          error: true, 
          message: `Path '${path}' is not a file, it's a ${data.type}` 
        });
      }

      const content = Buffer.from(data.content, 'base64').toString();

      return JSON.stringify({
        success: true,
        file: {
          name: data.name,
          path: data.path,
          size: data.size,
          content: content,
          encoding: data.encoding,
          sha: data.sha,
          html_url: data.html_url,
          download_url: data.download_url
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async listBranches(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.listBranches({ owner, repo });
      
      return JSON.stringify({
        success: true,
        branches: data.map(branch => ({
          name: branch.name,
          commit_sha: branch.commit.sha,
          commit_url: branch.commit.url,
          protected: branch.protected
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getCommits(owner, repo, params = {}) {
    try {
      const requestParams = { owner, repo };
      if (params.branch) requestParams.sha = params.branch;
      if (params.per_page) requestParams.per_page = params.per_page;
      if (params.page) requestParams.page = params.page;

      const { data } = await this.octokit.rest.repos.listCommits(requestParams);
      
      return JSON.stringify({
        success: true,
        commits: data.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date
          },
          committer: {
            name: commit.commit.committer.name,
            email: commit.commit.committer.email,
            date: commit.commit.committer.date
          },
          html_url: commit.html_url,
          stats: commit.stats
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getReleases(owner, repo) {
    try {
      const { data } = await this.octokit.rest.repos.listReleases({ owner, repo });
      
      return JSON.stringify({
        success: true,
        releases: data.map(release => ({
          id: release.id,
          tag_name: release.tag_name,
          name: release.name,
          body: release.body,
          draft: release.draft,
          prerelease: release.prerelease,
          published_at: release.published_at,
          html_url: release.html_url,
          assets_count: release.assets.length
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  // === ПОИСК ===

  async searchCode(owner, repo, query) {
    try {
      const searchQuery = `${query} repo:${owner}/${repo}`;
      const { data } = await this.octokit.rest.search.code({ q: searchQuery });
      
      return JSON.stringify({
        success: true,
        total_count: data.total_count,
        results: data.items.map(item => ({
          name: item.name,
          path: item.path,
          repository: item.repository.full_name,
          html_url: item.html_url,
          score: item.score
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async searchFiles(owner, repo, query) {
    try {
      const searchQuery = `filename:${query} repo:${owner}/${repo}`;
      const { data } = await this.octokit.rest.search.code({ q: searchQuery });
      
      return JSON.stringify({
        success: true,
        total_count: data.total_count,
        files: data.items.map(item => ({
          name: item.name,
          path: item.path,
          html_url: item.html_url,
          download_url: item.download_url
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  // === ISSUES ===

  async listIssues(owner, repo, params = {}) {
    try {
      const requestParams = { owner, repo };
      if (params.state) requestParams.state = params.state;
      if (params.per_page) requestParams.per_page = params.per_page;
      if (params.page) requestParams.page = params.page;

      const { data } = await this.octokit.rest.issues.listForRepo(requestParams);
      
      // Фильтруем только issues (не PR)
      const issues = data.filter(issue => !issue.pull_request);
      
      return JSON.stringify({
        success: true,
        issues: issues.map(issue => ({
          number: issue.number,
          title: issue.title,
          body: issue.body?.substring(0, 500) + (issue.body?.length > 500 ? '...' : ''),
          state: issue.state,
          user: issue.user.login,
          assignees: issue.assignees.map(a => a.login),
          labels: issue.labels.map(l => l.name),
          created_at: issue.created_at,
          updated_at: issue.updated_at,
          html_url: issue.html_url,
          comments: issue.comments
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getIssue(owner, repo, issue_number) {
    try {
      const { data } = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number
      });
      
      return JSON.stringify({
        success: true,
        issue: {
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          user: data.user.login,
          assignees: data.assignees.map(a => a.login),
          labels: data.labels.map(l => ({ name: l.name, color: l.color })),
          milestone: data.milestone ? data.milestone.title : null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          closed_at: data.closed_at,
          html_url: data.html_url,
          comments: data.comments
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  // === PULL REQUESTS ===

  async listPullRequests(owner, repo, params = {}) {
    try {
      const requestParams = { owner, repo };
      if (params.state) requestParams.state = params.state;
      if (params.per_page) requestParams.per_page = params.per_page;
      if (params.page) requestParams.page = params.page;

      const { data } = await this.octokit.rest.pulls.list(requestParams);
      
      return JSON.stringify({
        success: true,
        pull_requests: data.map(pr => ({
          number: pr.number,
          title: pr.title,
          body: pr.body?.substring(0, 500) + (pr.body?.length > 500 ? '...' : ''),
          state: pr.state,
          user: pr.user.login,
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha
          },
          draft: pr.draft,
          merged: pr.merged,
          mergeable: pr.mergeable,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          html_url: pr.html_url,
          comments: pr.comments,
          commits: pr.commits,
          additions: pr.additions,
          deletions: pr.deletions,
          changed_files: pr.changed_files
        }))
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getPullRequest(owner, repo, pull_number) {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number
      });
      
      return JSON.stringify({
        success: true,
        pull_request: {
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          user: data.user.login,
          head: {
            label: data.head.label,
            ref: data.head.ref,
            sha: data.head.sha,
            repo: data.head.repo ? data.head.repo.full_name : null
          },
          base: {
            label: data.base.label,
            ref: data.base.ref,
            sha: data.base.sha,
            repo: data.base.repo.full_name
          },
          draft: data.draft,
          merged: data.merged,
          mergeable: data.mergeable,
          mergeable_state: data.mergeable_state,
          merged_by: data.merged_by ? data.merged_by.login : null,
          merge_commit_sha: data.merge_commit_sha,
          assignees: data.assignees.map(a => a.login),
          requested_reviewers: data.requested_reviewers.map(r => r.login),
          labels: data.labels.map(l => ({ name: l.name, color: l.color })),
          milestone: data.milestone ? data.milestone.title : null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          closed_at: data.closed_at,
          merged_at: data.merged_at,
          html_url: data.html_url,
          diff_url: data.diff_url,
          patch_url: data.patch_url,
          comments: data.comments,
          review_comments: data.review_comments,
          commits: data.commits,
          additions: data.additions,
          deletions: data.deletions,
          changed_files: data.changed_files
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  // === АНАЛИЗ ===

  async analyzeProject(owner, repo) {
    try {
      // Получаем информацию о репозитории
      const repoData = await this.getRepository(owner, repo);
      const repo_info = JSON.parse(repoData).repository;

      // Получаем языки
      const { data: languages } = await this.octokit.rest.repos.listLanguages({ owner, repo });

      // Получаем основные файлы
      const { data: rootContents } = await this.octokit.rest.repos.getContent({ 
        owner, 
        repo, 
        path: '' 
      });

      const importantFiles = ['README.md', 'package.json', 'requirements.txt', 
                            'Dockerfile', 'docker-compose.yml', '.gitignore', 
                            'LICENSE', 'Makefile', 'setup.py', 'Cargo.toml'];
      
      const foundFiles = rootContents
        .filter(item => item.type === 'file')
        .map(item => item.name)
        .filter(name => importantFiles.some(important => 
          name.toLowerCase().includes(important.toLowerCase()) ||
          important.toLowerCase().includes(name.toLowerCase())
        ));

      // Анализируем структуру директорий
      const directories = rootContents
        .filter(item => item.type === 'dir')
        .map(item => item.name);

      return JSON.stringify({
        success: true,
        analysis: {
          repository: {
            name: repo_info.name,
            description: repo_info.description,
            primary_language: repo_info.language,
            size_kb: repo_info.size,
            stars: repo_info.stargazers_count,
            forks: repo_info.forks_count,
            open_issues: repo_info.open_issues_count,
            topics: repo_info.topics
          },
          languages: languages,
          structure: {
            important_files: foundFiles,
            directories: directories
          },
          project_type: this.detectProjectType(foundFiles, directories, languages),
          estimated_complexity: this.estimateComplexity(repo_info, languages, directories)
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  async getRepoStats(owner, repo) {
    try {
      const [
        { data: repo_data },
        { data: contributors },
        { data: commits },
        { data: languages }
      ] = await Promise.all([
        this.octokit.rest.repos.get({ owner, repo }),
        this.octokit.rest.repos.listContributors({ owner, repo, per_page: 10 }),
        this.octokit.rest.repos.listCommits({ owner, repo, per_page: 1 }),
        this.octokit.rest.repos.listLanguages({ owner, repo })
      ]);

      return JSON.stringify({
        success: true,
        stats: {
          repository: {
            size_kb: repo_data.size,
            default_branch: repo_data.default_branch,
            created_at: repo_data.created_at,
            updated_at: repo_data.updated_at,
            pushed_at: repo_data.pushed_at
          },
          engagement: {
            stars: repo_data.stargazers_count,
            watchers: repo_data.watchers_count,
            forks: repo_data.forks_count,
            open_issues: repo_data.open_issues_count
          },
          contributors: contributors.slice(0, 10).map(c => ({
            login: c.login,
            contributions: c.contributions,
            html_url: c.html_url
          })),
          languages: languages,
          activity: {
            last_commit_date: commits.length > 0 ? commits[0].commit.committer.date : null,
            last_committer: commits.length > 0 ? commits[0].commit.committer.name : null
          }
        }
      });
    } catch (error) {
      return JSON.stringify({ error: true, message: error.message });
    }
  }

  // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

  detectProjectType(files, directories, languages) {
    const languageKeys = Object.keys(languages);
    const mainLang = languageKeys[0];

    if (files.includes('package.json')) return 'Node.js/JavaScript Project';
    if (files.includes('requirements.txt') || files.includes('setup.py')) return 'Python Project';
    if (files.includes('Cargo.toml')) return 'Rust Project';
    if (files.includes('go.mod')) return 'Go Project';
    if (files.includes('pom.xml') || files.includes('build.gradle')) return 'Java Project';
    if (files.includes('Gemfile')) return 'Ruby Project';
    if (files.includes('composer.json')) return 'PHP Project';
    if (directories.includes('src') && mainLang === 'C++') return 'C++ Project';
    if (directories.includes('src') && mainLang === 'C') return 'C Project';
    if (files.some(f => f.endsWith('.sln'))) return 'C# Project';
    if (mainLang) return `${mainLang} Project`;
    
    return 'Mixed/Other Project';
  }

  estimateComplexity(repo_info, languages, directories) {
    let complexity = 0;
    
    // Размер репозитория
    if (repo_info.size > 100000) complexity += 3;
    else if (repo_info.size > 10000) complexity += 2;
    else if (repo_info.size > 1000) complexity += 1;
    
    // Количество языков
    const languageCount = Object.keys(languages).length;
    if (languageCount > 10) complexity += 3;
    else if (languageCount > 5) complexity += 2;
    else if (languageCount > 2) complexity += 1;
    
    // Количество директорий
    if (directories.length > 20) complexity += 2;
    else if (directories.length > 10) complexity += 1;

    // Количество звезд (популярность часто коррелирует со сложностью)
    if (repo_info.stargazers_count > 1000) complexity += 2;
    else if (repo_info.stargazers_count > 100) complexity += 1;

    if (complexity >= 8) return 'Very High';
    if (complexity >= 6) return 'High';
    if (complexity >= 4) return 'Medium';
    if (complexity >= 2) return 'Low';
    return 'Very Low';
  }

  // === WRITE OPERATIONS ===

  // === FILE MANAGEMENT ===

  async createFile(owner, repo, path, content, message = null, branch = null) {
    try {
      if (!path) {
        return JSON.stringify({ error: true, message: 'File path is required' });
      }
      
      if (!content) {
        return JSON.stringify({ error: true, message: 'File content is required' });
      }

      const commitMessage = message || `Create ${path}`;
      
      // Encode content to Base64
      const encodedContent = Buffer.from(content).toString('base64');
      
      const params = {
        owner,
        repo,
        path,
        message: commitMessage,
        content: encodedContent
      };

      // Add branch if specified
      if (branch) {
        params.branch = branch;
      }

      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents(params);
      
      return JSON.stringify({
        success: true,
        message: 'File created successfully',
        file: {
          path: data.content.path,
          sha: data.content.sha,
          size: data.content.size,
          html_url: data.content.html_url,
          download_url: data.content.download_url
        },
        commit: {
          sha: data.commit.sha,
          message: data.commit.message,
          author: data.commit.author,
          committer: data.commit.committer,
          html_url: data.commit.html_url
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  async updateFile(owner, repo, path, content, message = null, sha = null) {
    try {
      if (!path) {
        return JSON.stringify({ error: true, message: 'File path is required' });
      }
      
      if (!content) {
        return JSON.stringify({ error: true, message: 'File content is required' });
      }

      // If SHA is not provided, get current file to obtain SHA
      if (!sha) {
        try {
          const { data: currentFile } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path
          });
          sha = currentFile.sha;
        } catch (getError) {
          return JSON.stringify({ 
            error: true, 
            message: `Could not retrieve current file SHA: ${getError.message}` 
          });
        }
      }

      const commitMessage = message || `Update ${path}`;
      
      // Encode content to Base64
      const encodedContent = Buffer.from(content).toString('base64');
      
      const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: commitMessage,
        content: encodedContent,
        sha
      });
      
      return JSON.stringify({
        success: true,
        message: 'File updated successfully',
        file: {
          path: data.content.path,
          sha: data.content.sha,
          size: data.content.size,
          html_url: data.content.html_url,
          download_url: data.content.download_url
        },
        commit: {
          sha: data.commit.sha,
          message: data.commit.message,
          author: data.commit.author,
          committer: data.commit.committer,
          html_url: data.commit.html_url
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  async deleteFile(owner, repo, path, sha = null, message = null) {
    try {
      if (!path) {
        return JSON.stringify({ error: true, message: 'File path is required' });
      }

      // If SHA is not provided, get current file to obtain SHA
      if (!sha) {
        try {
          const { data: currentFile } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path
          });
          sha = currentFile.sha;
        } catch (getError) {
          return JSON.stringify({ 
            error: true, 
            message: `Could not retrieve current file SHA: ${getError.message}` 
          });
        }
      }

      const commitMessage = message || `Delete ${path}`;
      
      const { data } = await this.octokit.rest.repos.deleteFile({
        owner,
        repo,
        path,
        message: commitMessage,
        sha
      });
      
      return JSON.stringify({
        success: true,
        message: 'File deleted successfully',
        commit: {
          sha: data.commit.sha,
          message: data.commit.message,
          author: data.commit.author,
          committer: data.commit.committer,
          html_url: data.commit.html_url
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  // === BRANCH MANAGEMENT ===

  async createBranch(owner, repo, sourceBranch = null, newBranch = null) {
    try {
      if (!newBranch) {
        return JSON.stringify({ error: true, message: 'New branch name is required' });
      }

      // Get source branch SHA (default to main/master if not specified)
      let sourceSha;
      if (sourceBranch) {
        try {
          const { data: sourceRef } = await this.octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${sourceBranch}`
          });
          sourceSha = sourceRef.object.sha;
        } catch (error) {
          return JSON.stringify({ 
            error: true, 
            message: `Source branch '${sourceBranch}' not found: ${error.message}` 
          });
        }
      } else {
        // Get default branch SHA
        const { data: repoData } = await this.octokit.rest.repos.get({ owner, repo });
        const defaultBranch = repoData.default_branch;
        const { data: defaultRef } = await this.octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${defaultBranch}`
        });
        sourceSha = defaultRef.object.sha;
      }

      // Create new branch
      const { data } = await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${newBranch}`,
        sha: sourceSha
      });
      
      return JSON.stringify({
        success: true,
        message: 'Branch created successfully',
        branch: {
          name: newBranch,
          ref: data.ref,
          sha: data.object.sha,
          url: data.url
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  async deleteBranch(owner, repo, branchName) {
    try {
      if (!branchName) {
        return JSON.stringify({ error: true, message: 'Branch name is required' });
      }

      // Check if branch exists
      try {
        await this.octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${branchName}`
        });
      } catch (error) {
        return JSON.stringify({ 
          error: true, 
          message: `Branch '${branchName}' not found: ${error.message}` 
        });
      }

      // Delete branch
      await this.octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`
      });
      
      return JSON.stringify({
        success: true,
        message: `Branch '${branchName}' deleted successfully`
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  // === ISSUES MANAGEMENT ===

  async createIssue(owner, repo, title, body = null, assignees = null, labels = null, milestone = null) {
    try {
      if (!title) {
        return JSON.stringify({ error: true, message: 'Issue title is required' });
      }

      const params = {
        owner,
        repo,
        title
      };

      if (body) params.body = body;
      if (assignees && assignees.length > 0) params.assignees = assignees;
      if (labels && labels.length > 0) params.labels = labels;
      if (milestone) params.milestone = milestone;

      const { data } = await this.octokit.rest.issues.create(params);
      
      return JSON.stringify({
        success: true,
        message: 'Issue created successfully',
        issue: {
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          user: data.user.login,
          assignees: data.assignees.map(a => a.login),
          labels: data.labels.map(l => ({ name: l.name, color: l.color })),
          milestone: data.milestone ? data.milestone.title : null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          html_url: data.html_url,
          comments: data.comments
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  async updateIssue(owner, repo, issue_number, title = null, body = null, assignees = null, labels = null, milestone = null) {
    try {
      if (!issue_number) {
        return JSON.stringify({ error: true, message: 'Issue number is required' });
      }

      const params = {
        owner,
        repo,
        issue_number
      };

      if (title) params.title = title;
      if (body !== null) params.body = body;
      if (assignees !== null) params.assignees = assignees;
      if (labels !== null) params.labels = labels;
      if (milestone !== null) params.milestone = milestone;

      const { data } = await this.octokit.rest.issues.update(params);
      
      return JSON.stringify({
        success: true,
        message: 'Issue updated successfully',
        issue: {
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          user: data.user.login,
          assignees: data.assignees.map(a => a.login),
          labels: data.labels.map(l => ({ name: l.name, color: l.color })),
          milestone: data.milestone ? data.milestone.title : null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          html_url: data.html_url,
          comments: data.comments
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }

  async closeIssue(owner, repo, issue_number) {
    try {
      if (!issue_number) {
        return JSON.stringify({ error: true, message: 'Issue number is required' });
      }

      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number,
        state: 'closed'
      });
      
      return JSON.stringify({
        success: true,
        message: 'Issue closed successfully',
        issue: {
          number: data.number,
          title: data.title,
          body: data.body,
          state: data.state,
          user: data.user.login,
          assignees: data.assignees.map(a => a.login),
          labels: data.labels.map(l => ({ name: l.name, color: l.color })),
          milestone: data.milestone ? data.milestone.title : null,
          created_at: data.created_at,
          updated_at: data.updated_at,
          closed_at: data.closed_at,
          html_url: data.html_url,
          comments: data.comments
        }
      });
    } catch (error) {
      return JSON.stringify({ 
        error: true, 
        message: error.message,
        status: error.status 
      });
    }
  }
}

module.exports = GitHubTool;

const exportTime = new Date().toISOString();
console.log(`GitHubTool: Module exported. [${exportTime}]`); 