---
title: 📝 Documentation Guidelines
description: Learn how to write and format documentation for LibreChat.
weight: -9
---
# Documentation Guidelines

This document explains how to write and format documentation for LibreChat.

## New Documents
- Use lowercase letters and underscores to name new documents (e.g. `documentation_guidelines.md`).
- For new features, create new documentation and place it in the relevant folder/sub-folder under `../docs`.
  - If the feature adds new functionality, add it to the feature section of the main `README.md` as well as in `../docs/index.md`.
- When you create a new document, **you need to add it to two table of contents:**
  - in `README.md`
  - and in the `index.md` file in the folder where your doc is located

## Markdown Formatting
- Use `#`, `##`, and `###` for headings and subheadings.
- Use `#` for the title of the document.
- Use `##` for the main sections of the document.
- Use `###` for the sub-sections within a section.
- Use `**` to make text **bold** to highlight important information (do not use in place of a heading).
- Use relative paths for links to other documents.
- You can use HTML to add more features to a document.
- By default the title indexed by mkdocs will be the first heading. You can override this by adding metadata at the top of your document:
```bash
---
title: Document Title
description: This description will be used in social cards
weight: 0
---
```
- Setting the weight in the document metadata will influence its position in the table of contents. Lowest weight are placed first. Not setting it will default to `0`. When multiple docs have the same weight it sorts in alphabetical order.

## Important Notes
- **⚠️Keep it organized and structured⚠️** 
- Do not add unrelated information to an existing document. Create a new one if needed.
- All assets should be uploaded in the document from GitHub's webui
- **Before submitting a PR, double-check on GitHub that everything is properly displayed and that all links work correctly.**

![image](https://github.com/danny-avila/LibreChat/assets/32828263/4f138ab4-31a5-4fae-a459-5335e5ff25a8)

## Tips
- You can check the code of this document to see how it works. 
- You can run MKDocs locally to test bigger documentation changes
- You can ask GPT or Bing for help with proofreading, syntax, and markdown formatting. 
  
---
### Example of HTML image embedding:
<p align="center">
  <a href="https://discord.gg/NGaa9RPCft">
    <img src="https://github.com/danny-avila/LibreChat/assets/32828263/45890a7c-5b8d-4650-a6e0-aa5d7e4951c3" height="128" width="128">
  </a>
  <a href="https://librechat.ai">
    <h3 align="center">LibreChat</h3>
  </a>
</p>
