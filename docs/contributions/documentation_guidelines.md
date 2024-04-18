---
title: 📝 Documentation Guidelines
description: Learn how to contribute to the LibreChat documentation by following these guidelines.
weight: -9
---

# Documentation Contribution Guidelines

This document explains how to contribute to the LibreChat documentation by writing and formatting new documentation.

## New Documents

- Use ^^lowercase letters^^ and ^^underscores^^ to name new document files (e.g.: ==documentation_guidelines.md==).
- For new features, create new documentation and place it in the relevant folder/sub-folder under ==../docs==.
  - If the feature adds new functionality, add it to the appropriate section in the main `README.md` and `../docs/index.md`.
- When creating a new document, **add it to the table of contents in the `index.md` file of the folder where your document is located.**

## Markdown Formatting

- Use `#`, `##`, and `###` for headings and subheadings. 
- Use `#` for the document title.
    - ❗ **Only one main title per document is allowed**
- Use `##` for the main sections of the document.
- Use `###` for the sub-sections within a section.
- Use `**` to make text **bold** and highlight important information (do not use in place of a heading).
- Use relative paths for links to other documents.
- You can use HTML to add additional features to a document.
- Highlight keystrokes with `+` (example: `++ctrl+alt+del++` 🟰 ++ctrl+alt+del++)
- Make sure any HTML has closing tags; i.e.: `<img src="" />` or `<a href="link"></a>`
- [HTML comments](https://www.w3schools.com/html/html_comments.asp) are not allowed. Use [Markdown comments](https://gist.github.com/jonikarppinen/47dc8c1d7ab7e911f4c9?permalink_comment_id=4272770#gistcomment-4272770) instead, and only if the text is actually hidden.
- 🌐 see the MKDocs Material documentation for more information: [MKDocs Material Reference](https://squidfunk.github.io/mkdocs-material/reference/)

## Document Metadata

- Add metadata in the header of your document following this format:

```yaml title="metadata example:"
---
title: 😊 Document Title
description: This description will be used in social cards and search engine results.
weight: 0
---
```

- `title:` Begin with an emoji representing your new document, followed by a descriptive title.
- `description:` A brief description of the document's content.
- `weight:` Setting the weight in the document metadata will influence its position in the table of contents. Lowest weights are placed first. If not set, it defaults to `0`. When multiple docs have the same weight, they are sorted alphabetically.

!!! warning "Important Notes"

    - 🗃️ **Keep the documentation organized and structured**
    - 🙅 Do not add unrelated information to an existing document. Create a new one if needed.
    - 📌 Upload all assets (images, files) directly from GitHub when editing the document (see tip below).

??? tip "Upload Assets on GitHub"

    !!! example "Example"
        - Go to the LibreChat repository, find a conversation, and paste an image from your clipboard into the text input box. It will automatically be converted into a URL you can use in your document. (Then exit the page without actually posting the comment.😉)

        Get the link from a text input box:
        ![image](https://github.com/danny-avila/LibreChat/assets/32828263/c1612f93-a6c0-4af7-9965-9f83872cff00)

    !!! example "Alternative method"
        Upload directly from the web UI:
        ![image](https://github.com/danny-avila/LibreChat/assets/32828263/4f138ab4-31a5-4fae-a459-5335e5ff25a8)

## Testing New Documents

- When adding new documents, it is important to test them locally using MkDocs to ensure correct formatting and proper organization in the table of contents: specifically in **index.md** and in the **left panel** of each category. Make sure the document position match in both.

### Setup MkDocs Locally

- Requirement: **Python 3.3** and later (on older versions you will need to install virtualenv)

#### Material for MkDocs Installation

- We are using MkDocs Material and multiple plugins. All of them are required to properly test new documentation.

```sh title="Install Requirements:"
python -m venv .venv
. .venv/bin/activate
pip install -r ./docs/src/requirements.txt
```

#### Running MkDocs

- Use this command to start MkDocs:

```sh title="Start MKDocs:"
mkdocs serve
```

- ✅ Look for any errors in the console logs and fix them whenever possible.
- 🌐 Access the locally running documentation website at `http://127.0.0.1:8000/`.

  ![image](https://github.com/danny-avila/LibreChat/assets/32828263/d5489a5f-2b4d-4cf5-b8a1-d0ea1d8a67cd)

## Tips

!!! tip "Tips"

    - You can check the code of this document to see how it works.
    - You should run MkDocs locally to test more extensive documentation changes.
    - You can ask GPT, Claude or any other AI for help with proofreading, syntax, and markdown formatting.

---

## Example of HTML image embedding:

```html title="HTML Code"
<p align="center">
  <a href="https://discord.librechat.ai">
    <img src="https://github.com/danny-avila/LibreChat/assets/32828263/45890a7c-5b8d-4650-a6e0-aa5d7e4951c3" height="128" width="128"/>
  </a>
  <a href="https://librechat.ai">
    <h3 align="center">LibreChat</h3>
  </a>
</p>
```

!!! quote "Result:"
    <p align="center">
      <a href="https://discord.librechat.ai">
        <img src="https://github.com/danny-avila/LibreChat/assets/32828263/45890a7c-5b8d-4650-a6e0-aa5d7e4951c3" height="128" width="128"/>
      </a>
      <a href="https://librechat.ai">
        <h3 align="center">LibreChat</h3>
      </a>
    </p>
