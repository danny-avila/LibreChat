const logger = require('~/config/winston');

/**
 * Context Manager for E2B Agent
 * 
 * Centralized management of LLM context to eliminate ambiguity and guessing.
 * Ensures LLM always has explicit, structured information about:
 * - Available files and their exact paths
 * - Generated artifacts (images, models)
 * - Analysis history in current session
 * - Sandbox environment state
 * - Error-specific recovery guidance
 * 
 * Design Principles:
 * 1. Explicit over Implicit: Complete paths, usage examples, no assumptions
 * 2. No Internal IDs: Never expose UUIDs, file_ids, or internal identifiers
 * 3. Action-Oriented: Provide exact commands/code LLM should use
 * 4. Structured Format: Clear hierarchy with headers and visual markers
 */
class ContextManager {
  constructor({ userId, conversationId }) {
    this.userId = userId;
    this.conversationId = conversationId;
    this.sessionState = {
      uploadedFiles: [],
      generatedArtifacts: [],
    };
    logger.info(`[ContextManager] NEW INSTANCE created for conversation ${conversationId}, userId ${userId}`);
    logger.info(`[ContextManager] Initial state: files=0, artifacts=0`);
  }

  /**
   * Update file state when user uploads files
   * Stores both user-facing info AND internal file_id for recovery purposes
   * 
   * @param {Array} files - Array of file objects with filename, size, type, file_id
   */
  updateUploadedFiles(files) {
    this.sessionState.uploadedFiles = files.map(f => ({
      filename: f.filename,
      size: f.size,
      type: f.type,
      file_id: f.file_id, // Store for sandbox recovery, but NEVER expose to LLM
    }));
    logger.info(`[ContextManager] Updated files: ${files.map(f => f.filename).join(', ')}`);
  }

  /**
   * Track generated artifacts (images, data files, models)
   * 
   * @param {Object} artifact - Artifact metadata
   */
  addGeneratedArtifact(artifact) {
    this.sessionState.generatedArtifacts.push({
      type: artifact.type, // 'image', 'csv', 'model', 'report'
      name: artifact.name,
      path: artifact.path,
      description: artifact.description,
      timestamp: Date.now(),
      conversationId: this.conversationId, // CRITICAL: Track which conversation generated this
    });
    logger.info(`[ContextManager] Added artifact for conversation ${this.conversationId}: ${artifact.name} (${artifact.type}) at ${artifact.path}`);
    logger.info(`[ContextManager] Total artifacts now: ${this.sessionState.generatedArtifacts.length}`);
  }

  /**
   * Generate structured context for system prompt injection
   * This is THE source of truth for LLM about current state
   * 
   * @returns {string} Formatted context string
   */
  generateSystemContext() {
    logger.info(`[ContextManager] Generating system context for conversation ${this.conversationId}`);
    logger.info(`[ContextManager] Current state: files=${this.sessionState.uploadedFiles.length}, artifacts=${this.sessionState.generatedArtifacts.length}`);
    
    if (this.sessionState.generatedArtifacts.length > 0) {
      logger.info(`[ContextManager] Artifacts in this conversation:`);
      this.sessionState.generatedArtifacts.forEach((art, idx) => {
        logger.info(`[ContextManager]   ${idx + 1}. ${art.name} (${art.type}) - ${art.path} - convId: ${art.conversationId}`);
      });
    }
    
    const sections = [];

    // 1. FILES CONTEXT - Most Critical
    if (this.sessionState.uploadedFiles.length > 0) {
      sections.push(this._generateFilesContext());
    }

    // 2. ARTIFACTS CONTEXT (images generated in this session)
    if (this.sessionState.generatedArtifacts.length > 0) {
      sections.push(this._generateArtifactsContext());
    }

    return sections.length > 0 
      ? '\n\n' + sections.join('\n\n---\n\n')
      : '';
  }

  /**
   * Generate EXPLICIT file access instructions
   * Provides complete paths and usage examples
   * 
   * @private
   * @returns {string} Files context section
   */
  _generateFilesContext() {
    const filesList = this.sessionState.uploadedFiles
      .map(f => {
        const fullPath = `/home/user/${f.filename}`;
        const ext = f.filename.split('.').pop()?.toLowerCase();

        let usageHint;
        if (ext === 'pdf') {
          usageHint = `# Option 1 - Best for LLM reading (Markdown with tables):
import pymupdf4llm
text = pymupdf4llm.to_markdown('${fullPath}')
print(text[:3000])

# Option 2 - Table extraction:
import camelot
tables = camelot.read_pdf('${fullPath}', pages='all')
df = tables[0].df  # first table

# Option 3 - Fast text extraction:
import fitz
doc = fitz.open('${fullPath}')
text = '\\n'.join(page.get_text() for page in doc)`;
        } else if (ext === 'docx') {
          usageHint = `from docx import Document
doc = Document('${fullPath}')
text = '\\n'.join(p.text for p in doc.paragraphs)
print(text[:3000])`;
        } else if (ext === 'pptx') {
          usageHint = `from pptx import Presentation
prs = Presentation('${fullPath}')
text = '\\n'.join(shape.text for slide in prs.slides for shape in slide.shapes if hasattr(shape, 'text'))
print(text[:3000])`;
        } else if (['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp'].includes(ext)) {
          usageHint = `# OCR image (deep learning, 80+ languages):
import easyocr
reader = easyocr.Reader(['en', 'ch_sim'])  # add languages as needed
result = reader.readtext('${fullPath}')
text = '\\n'.join([r[1] for r in result])
print(text)`;
        } else if (ext === 'csv') {
          usageHint = `df = pd.read_csv('${fullPath}')`;
        } else if (['xlsx', 'xls'].includes(ext)) {
          usageHint = `df = pd.read_excel('${fullPath}')
# Multiple sheets: pd.read_excel('${fullPath}', sheet_name=None)`;
        } else if (ext === 'parquet') {
          usageHint = `df = pd.read_parquet('${fullPath}')`;
        } else if (ext === 'json') {
          usageHint = `df = pd.read_json('${fullPath}')`;
        } else {
          // Universal fallback: markitdown
          usageHint = `# Universal converter (PDF/Word/Excel/PPT/HTML → Markdown):
from markitdown import MarkItDown
md = MarkItDown()
result = md.convert('${fullPath}')
print(result.text_content[:3000])`;
        }

        return `  📄 ${f.filename}
     Path: ${fullPath}
     Usage:
\`\`\`python
${usageHint}
\`\`\``;
      })
      .join('\n\n');

    return `## 📁 AVAILABLE FILES IN SANDBOX

${filesList}

⚠️ CRITICAL RULES:
1. Use COMPLETE paths exactly as shown above
2. NEVER add UUID, prefix, or modify the filename
3. If file not found, use list_files('/home/user') to check available files

📊 VISUALIZATION TIP:
- Just use plt.show() - images are captured automatically`;
  }

  /**
   * Track previously generated artifacts
   * 
   * @private
   * @returns {string} Artifacts context section
   */
  _generateArtifactsContext() {
    const recentArtifacts = this.sessionState.generatedArtifacts
      .slice(-5) // Last 5 artifacts
      .map(a => `  • ${a.name} (${a.type}): ${a.description || 'Generated artifact'}`)
      .join('\n');

    return `## 📊 PREVIOUSLY GENERATED ARTIFACTS

${recentArtifacts}

Note: These are available for reference but may have been from previous analyses.`;
  }

  /**
   * Generate context-aware error recovery guidance
   * Provides specific solutions based on error type
   * 
   * @param {string} error - Error message
   * @returns {string} Recovery guidance
   */
  generateErrorRecoveryContext(error) {
    const sections = [`## ⚠️ ERROR RECOVERY CONTEXT\n`];

    // File-specific recovery
    if (error.includes('FileNotFoundError') || error.includes('No such file')) {
      sections.push(this._generateFileRecoveryGuidance());
    }

    // Import error recovery
    if (error.includes('ModuleNotFoundError') || error.includes('ImportError')) {
      sections.push(this._generateImportRecoveryGuidance());
    }

    // Memory error recovery
    if (error.includes('MemoryError')) {
      sections.push(this._generateMemoryRecoveryGuidance());
    }

    // Matplotlib style error recovery (common and has specific fix)
    if (error.includes('seaborn') && error.includes('not a valid package style')) {
      sections.push(this._generateMatplotlibStyleRecovery());
    }

    // Generic error analysis guidance
    if (sections.length === 1) { // Only header, no specific guidance
      sections.push(this._generateGenericErrorGuidance());
    }

    return sections.join('\n\n');
  }

  /**
   * File-specific recovery guidance
   * 
   * @private
   * @returns {string} File recovery guidance
   */
  _generateFileRecoveryGuidance() {
    if (this.sessionState.uploadedFiles.length === 0) {
      return `❌ No files are currently uploaded in this session.
💡 Ask the user to upload the required data file.`;
    }

    const filesList = this.sessionState.uploadedFiles
      .map(f => `  • ${f.filename} → use path: /home/user/${f.filename}`)
      .join('\n');

    return `✅ Available files in /home/user/:
${filesList}

💡 SOLUTION: Use the EXACT paths shown above.
   Common mistake: Adding UUID prefix - this is WRONG!
   
Correct code:
df = pd.read_csv('/home/user/${this.sessionState.uploadedFiles[0].filename}')`;
  }

  /**
   * Import error recovery guidance
   * 
   * @private
   * @returns {string} Import recovery guidance
   */
  _generateImportRecoveryGuidance() {
    return `💡 SOLUTION: 
1. Check if the library is in the allowed list
2. Use alternative libraries if available
3. Try installing: !pip install <package-name>`;
  }

  /**
   * Memory error recovery guidance
   * 
   * @private
   * @returns {string} Memory recovery guidance
   */
  _generateMemoryRecoveryGuidance() {
    return `💡 SOLUTION:
1. Load data in chunks: pd.read_csv(file, chunksize=10000)
2. Optimize data types: df = df.astype({'col': 'int32'})
3. Drop unnecessary columns early
4. Use sampling for exploration: df.sample(1000)`;
  }
  /**
   * Matplotlib style error recovery
   * 
   * @private
   * @returns {string} Style recovery guidance
   */
  _generateMatplotlibStyleRecovery() {
    return `❌ ERROR: 'seaborn' style is not available in matplotlib 3.6+

💡 SOLUTION - Choose one:
1. Remove the style line completely (use default)
2. Use seaborn's set_theme():
   import seaborn as sns
   sns.set_theme()
3. Use other matplotlib styles:
   plt.style.use('ggplot')
   plt.style.use('bmh')
   plt.style.use('fivethirtyeight')
   
Available styles: plt.style.available`;
  }

  /**
   * Generic error guidance - help LLM debug by itself
   * 
   * @private
   * @returns {string} Generic debugging guidance
   */
  _generateGenericErrorGuidance() {
    return `💡 DEBUGGING TIPS:

1. **Read the error traceback carefully** - it tells you exactly what went wrong
2. **Check data types** - Use df.dtypes, df.info() to inspect your data
3. **Inspect the data** - Use df.head(), df.describe() to understand structure
4. **Common issues**:
   - Operating on wrong data type (e.g., strings when expecting numbers)
   - Missing values causing operations to fail
   - Wrong column names or indexing errors
   - File paths or directory issues

5. **Fix strategy**:
   - Filter/select appropriate columns: df.select_dtypes()
   - Handle missing values: df.dropna(), df.fillna()
   - Convert types: df.astype(), pd.to_numeric()
   - Check available columns: df.columns.tolist()

Analyze the error message and traceback to determine the root cause, then fix accordingly.`;
  }

  /**
   * Get current session state summary for logging
   * 
   * @returns {Object} State summary
   */
  getSummary() {
    return {
      files: this.sessionState.uploadedFiles.length,
      artifacts: this.sessionState.generatedArtifacts.length,
    };
  }

  /**
   * Clear session state (for testing or reset)
   */
  reset() {
    this.sessionState = {
      uploadedFiles: [],
      generatedArtifacts: [],
    };
    logger.info(`[ContextManager] Session state reset for conversation ${this.conversationId}`);
  }
}

module.exports = ContextManager;
