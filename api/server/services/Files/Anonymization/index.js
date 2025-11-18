const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('@librechat/data-schemas');

const ANONYMIZATION_DIR = __dirname;
const TEXT_EXTRACTOR_SCRIPT = path.join(ANONYMIZATION_DIR, 'text_extractor.py');
const PII_REMOVER_SCRIPT = path.join(ANONYMIZATION_DIR, 'pii_remover.py');

/**
 * Execute a Python script and return the result as JSON
 * @param {string} scriptPath - Path to the Python script
 * @param {string[]} args - Arguments to pass to the script
 * @param {string} [stdin] - Optional stdin input
 * @returns {Promise<Object>} Parsed JSON result
 */
function executePythonScript(scriptPath, args = [], stdin = null) {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(pythonCmd, [scriptPath, ...args], {
      stdio: stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      logger.error(`[Anonymization] Failed to spawn Python process: ${error.message}`);
      reject(new Error(`Failed to execute Python script: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        logger.error(`[Anonymization] Python script exited with code ${code}`);
        logger.error(`[Anonymization] stderr: ${stderr}`);
        
        // Try to parse error from stderr (might be JSON)
        try {
          const errorObj = JSON.parse(stderr.trim());
          reject(new Error(errorObj.error || stderr || 'Unknown error'));
        } catch {
          reject(new Error(stderr || `Python script exited with code ${code}`));
        }
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (!result.success) {
          reject(new Error(result.error || 'Anonymization failed'));
          return;
        }
        // Include stderr in result for debugging
        result.stderr = stderr;
        resolve(result);
      } catch (error) {
        logger.error(`[Anonymization] Failed to parse JSON output: ${stdout}`);
        reject(new Error(`Failed to parse script output: ${error.message}`));
      }
    });

    // Write stdin if provided
    if (stdin && child.stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

/**
 * Extract text from a file using Python text extraction script
 * @param {string} filePath - Path to the file to extract text from
 * @returns {Promise<string>} Extracted text
 */
async function extractTextFromFile(filePath) {
  try {
    logger.info(`[Anonymization] Extracting text from: ${filePath}`);
    const result = await executePythonScript(TEXT_EXTRACTOR_SCRIPT, [filePath]);
    logger.info(`[Anonymization] Successfully extracted ${result.length} characters`);
    return result.text;
  } catch (error) {
    logger.error(`[Anonymization] Text extraction failed: ${error.message}`);
    throw error;
  }
}

/**
 * Remove PII from text using Python PII removal script
 * @param {string} text - Text to clean
 * @returns {Promise<{cleanedText: string, removedItems: Array, removedCount: number}>} Cleaned text and removal info
 */
async function removePIIFromText(text) {
  try {
    logger.info(`[Anonymization] Removing PII from text (${text.length} characters)`);
    const result = await executePythonScript(PII_REMOVER_SCRIPT, ['--stdin'], text);
    
    // Log stderr output if available (for debug messages)
    if (result.stderr && result.stderr.trim()) {
      const stderrLines = result.stderr.trim().split('\n');
      stderrLines.forEach(line => {
        if (line.trim()) {
          logger.info(`[Anonymization] Python: ${line.trim()}`);
        }
      });
    }
    
    logger.info(`[Anonymization] Removed ${result.removed_count} PII items`);
    return {
      cleanedText: result.cleaned_text,
      removedItems: result.removed_items || [],
      removedCount: result.removed_count || 0,
    };
  } catch (error) {
    logger.error(`[Anonymization] PII removal failed: ${error.message}`);
    throw error;
  }
}

/**
 * Anonymize a file by extracting text, removing PII, and replacing the file content
 * This follows the same workflow as the original Anonymization_tools:
 * 1. Extract text from file (text_extractor.py)
 * 2. Remove PII from extracted text (pii_remover.py)
 * 3. Replace original file with cleaned text file
 * 4. Save anonymized content to a separate file for review
 * 5. Log anonymized content to console
 * 
 * @param {string} filePath - Path to the file to anonymize
 * @param {Object} options - Options for anonymization
 * @param {boolean} options.extractText - Whether to extract text first (default: true)
 * @param {boolean} options.removePII - Whether to remove PII (default: true)
 * @returns {Promise<{success: boolean, removedCount: number, originalSize: number, newSize: number}>}
 */
async function anonymizeFile(filePath, options = {}) {
  const { extractText: shouldExtract = true, removePII: shouldRemovePII = true } = options;

  try {
    // Get original file stats
    const originalStats = await fs.stat(filePath);
    const originalSize = originalStats.size;

    let textContent = '';
    let cleanedText = '';

    // Step 1: Extract text from file (like text_extractor.py)
    if (shouldExtract) {
      textContent = await extractTextFromFile(filePath);
    } else {
      // If not extracting, try to read as text file
      try {
        textContent = await fs.readFile(filePath, 'utf-8');
      } catch {
        // If it's not a text file, we need to extract
        textContent = await extractTextFromFile(filePath);
      }
    }

    // Step 2: Remove PII from extracted text (like pii_remover.py)
    if (shouldRemovePII && textContent) {
      const piiResult = await removePIIFromText(textContent);
      cleanedText = piiResult.cleanedText;
      
      // Step 3: Replace the original file with cleaned text
      // This ensures when the file is uploaded to OpenAI, it's the cleaned version
      await fs.writeFile(filePath, cleanedText, 'utf-8');
      
      // Step 4: Save anonymized content to a separate file for review
      const anonymizedFilePath = filePath + '.anonymized.txt';
      await fs.writeFile(anonymizedFilePath, cleanedText, 'utf-8');
      logger.info(`[Anonymization] Anonymized content saved to: ${anonymizedFilePath}`);
      
      // Step 5: Log anonymized content to console
      logger.info(`[Anonymization] ========== ANONYMIZED CONTENT (will be sent to ChatGPT) ==========`);
      logger.info(`[Anonymization] File: ${path.basename(filePath)}`);
      logger.info(`[Anonymization] PII Items Removed: ${piiResult.removedCount}`);
      if (piiResult.removedItems && piiResult.removedItems.length > 0) {
        logger.info(`[Anonymization] Removed Items:`);
        piiResult.removedItems.forEach((item, idx) => {
          logger.info(`[Anonymization]   ${idx + 1}. ${item.type}: "${item.text}" -> "${item.replacement}"`);
        });
      }
      logger.info(`[Anonymization] Content Length: ${cleanedText.length} characters`);
      logger.info(`[Anonymization] --- Content Start ---`);
      // Log the content (truncate if too long for readability)
      const maxLogLength = 5000; // Log first 5000 chars, then show summary
      if (cleanedText.length > maxLogLength) {
        logger.info(cleanedText.substring(0, maxLogLength));
        logger.info(`[Anonymization] ... (content truncated, ${cleanedText.length - maxLogLength} more characters) ...`);
      } else {
        logger.info(cleanedText);
      }
      logger.info(`[Anonymization] --- Content End ---`);
      logger.info(`[Anonymization] ================================================================`);
      
      const newStats = await fs.stat(filePath);
      const newSize = newStats.size;

      logger.info(
        `[Anonymization] File anonymized: ${filePath} (${originalSize} -> ${newSize} bytes, ${piiResult.removedCount} PII items removed)`,
      );

      return {
        success: true,
        removedCount: piiResult.removedCount,
        removedItems: piiResult.removedItems,
        originalSize,
        newSize,
        anonymizedFilePath,
      };
    } else {
      // If no PII removal, just write extracted text
      await fs.writeFile(filePath, textContent, 'utf-8');
      
      // Still save and log the extracted content
      const extractedFilePath = filePath + '.extracted.txt';
      await fs.writeFile(extractedFilePath, textContent, 'utf-8');
      logger.info(`[Anonymization] Extracted content saved to: ${extractedFilePath}`);
      logger.info(`[Anonymization] ========== EXTRACTED CONTENT (will be sent to ChatGPT) ==========`);
      logger.info(`[Anonymization] File: ${path.basename(filePath)}`);
      logger.info(`[Anonymization] Content Length: ${textContent.length} characters`);
      logger.info(`[Anonymization] --- Content Start ---`);
      const maxLogLength = 5000;
      if (textContent.length > maxLogLength) {
        logger.info(textContent.substring(0, maxLogLength));
        logger.info(`[Anonymization] ... (content truncated, ${textContent.length - maxLogLength} more characters) ...`);
      } else {
        logger.info(textContent);
      }
      logger.info(`[Anonymization] --- Content End ---`);
      logger.info(`[Anonymization] ================================================================`);
      
      const newStats = await fs.stat(filePath);
      const newSize = newStats.size;

      return {
        success: true,
        removedCount: 0,
        removedItems: [],
        originalSize,
        newSize,
        anonymizedFilePath: extractedFilePath,
      };
    }
  } catch (error) {
    logger.error(`[Anonymization] Failed to anonymize file ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Check if Python and required libraries are available
 * @returns {Promise<boolean>} True if available, false otherwise
 */
async function checkDependencies() {
  try {
    // Check if text extractor works
    const testFile = path.join(ANONYMIZATION_DIR, '..', '..', '..', '..', 'package.json');
    if (await fs.access(testFile).then(() => true).catch(() => false)) {
      await executePythonScript(TEXT_EXTRACTOR_SCRIPT, [testFile]);
    }
    return true;
  } catch (error) {
    logger.warn(`[Anonymization] Dependency check failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  extractTextFromFile,
  removePIIFromText,
  anonymizeFile,
  checkDependencies,
};

