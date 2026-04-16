# Static Content Guide

The static content pages for NJ AI Assistant are designed to be editable by anyone (not just engineers).

Here's how to do it:

1. Go to Google Docs and open the "Static Content for NJ AI Assistant" doc.
2. Update the content in the tab you want to edit.
3. Go to File → Download → Markdown (.md).
4. Open the associated markdown file in GitHub (e.g. `release-notes.md`).
    - All content files are located [here](https://github.com/newjersey/LibreChat/tree/newjersey/client/src/nj/content). 
5. Click the "edit this file" icon on the upper right.
6. Copy/paste the Google Docs markdown text into GitHub editor.
    - _Warning: some docs have 'related links' at the bottom that are still handled by engineers - make sure to remove
      that from your edits!_
7. Click "Commit changes" and select "Create a new branch for this commit and start a pull request."
8. Wait for an engineer to review & merge the change.

## Associations

All content files can be found [here](https://github.com/newjersey/LibreChat/tree/newjersey/client/src/nj/content).

Here's how the Google Docs tabs maps to content:

- "Release Notes" → `release-notes.md`
- "About the AI Assistant" → `about-the-ai-assistant.md`
- "Update Widget" → `update-widget.md`
