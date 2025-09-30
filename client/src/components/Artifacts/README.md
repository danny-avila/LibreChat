# PDF Artifact Viewer

This directory contains components for viewing PDF files in the artifact system, with support for clickable citations that open to specific pages.

## Components

### PDFViewer.tsx
A standalone PDF viewer component with:
- Page navigation (previous/next, direct page input)
- Zoom controls (zoom in/out, percentage display)
- Rotation support
- Download functionality
- Loading and error states

### PDFArtifact.tsx
A wrapper component that integrates PDFViewer with the artifact system:
- Extracts file URL and metadata from artifact objects
- Handles missing file scenarios gracefully
- Passes through page navigation props

### ArtifactTabs.tsx (Modified)
Enhanced to support PDF viewing:
- Detects PDF files by extension or MIME type
- Renders PDFArtifact for PDF files instead of code editor
- Hides code tab for PDF artifacts
- Supports page navigation props

## Integration

### Citation System
The citation system has been enhanced to:
- Detect PDF file citations with page information
- Open the artifact viewer when clicking PDF citations
- Navigate to the specific page mentioned in the citation
- Fall back to download for non-PDF files

### Context
- `ArtifactContext` provides the `openArtifactWithPage` function
- Allows citations to trigger artifact viewer with specific page
- Maintains page state across artifact navigation

## Usage

1. **File Search Results**: When file search returns results with page information, citations will include page data
2. **Click Citation**: Clicking a PDF citation opens the artifact viewer to the specific page
3. **Navigate**: Use the toolbar controls to navigate between pages, zoom, rotate, etc.
4. **Download**: Use the download button to save the PDF locally

## Dependencies

- `pdfjs-dist`: For PDF rendering and page navigation
- `lucide-react`: For toolbar icons
- Existing LibreChat components and utilities

## Page Information

The system expects page information in the citation data:
```javascript
{
  pages: [1, 2, 3], // Array of page numbers
  pageRelevance: { 1: 0.95, 2: 0.87, 3: 0.72 } // Page relevance scores
}
```

This data is automatically captured by the file search tool and passed through the citation system.
