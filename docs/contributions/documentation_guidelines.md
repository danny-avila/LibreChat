# Documentation Guidelines

This document explains how to write and format documentation for LibreChat.

## New Documents
- Use lowercase letters and underscores to name new documents (e.g. `documentation_guidelines.md`).
- For new features, create new documentation and place it in the relevant folder/sub-folder under [docs](../docs/).
  - If the feature adds new functionality, add it to the feature section of the main [README.md](../../README.md).
- When you create a new document, **add it to both table of contents:**
  - [README.md](../../README.md)
  - [mkdocs.yml](../../mkdocs.yml) 

## Formatting
- Use `#`, `##`, and `###` for headings and subheadings.
- Use `#` for the title of the document.
- Use `##` for the main sections of the document.
- Use `###` for the sub-sections within a section.
- Use `**` to make text bold to highlight important information (not in place of a heading).
- Use relative paths for images and links to other documents.
- You can use HTML to add more features to a document.

## Important Notes
- **⚠️Keep it organized and structured⚠️** 
- Do not add unrelated information to an existing document. Create a new one if needed.
- All assets go into [assets/docs](../assets/docs/).
  - The assets folder structure follows the same structure as the docs folder structure.
  - The assets should have the same name as your documents followed by `-` and a number (e.g. `documentation_guidelines-1.png`).
- **Before submitting a PR, double-check on GitHub that everything is properly displayed and that all links work correctly.**
## Tips
- You can check the code of this document to see how it works. 
- You can ask GPT or Bing for help with proofreading, syntax, and markdown formatting. 
  
---
### Example of HTML image embedding:
<p align="center">
  <a href="https://discord.gg/NGaa9RPCft">
    <img src="../assets/LibreChat.svg" height="128">
  </a>
  <a href="https://librechat.ai">
    <h2 align="center">LibreChat</h2>
  </a>
</p>