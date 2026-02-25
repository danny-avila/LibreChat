[![smithery badge](https://smithery.ai/badge/@hamid-vakilzadeh/mcpsemanticscholar)](https://smithery.ai/server/@hamid-vakilzadeh/mcpsemanticscholar)

# AI Research Assistant - MCP

A Model Context Protocol (MCP) server that provides AI models with comprehensive access to the Semantic Scholar Academic Graph API. This server enables intelligent literature search, paper analysis, and citation network exploration through a robust set of tools, resources, and prompts.

> The MCP project extends the work we started in our academic paper on using AI as a research assistant. In that paper, we focused on [retrieval-augmented generation (RAG) as a practical approach to support research tasks](http://lit-review-assistant.streamlit.app/). By the time the paper was published, we had already moved forward with MCP, which takes the core ideas further and delivers a more capable system. While MCP isn’t covered in the paper, it continues the same effort and reflects what we learned along the way.
>
> If you’re referencing this project, please also cite the following paper to acknowledge the original research:
>
> <strong>Vakilzadeh, H., and Wood, D. A. (2025). The Development of a RAG-Based Artificial Intelligence Research Assistant (AIRA). <em>Journal of Information Systems forthcoming</em>.</strong>

## Installation

- To install this MCP Server visit [Smithery](https://smithery.ai/server/@hamid-vakilzadeh/mcpsemanticscholar).

## Optional: Wiley Full-Text Access

To enable full-text PDF download from Wiley papers, you'll need a Wiley TDM Client Token:

1. **Visit**: [Wiley Text and Data Mining](https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining)
2. **Accept** the Wiley terms and conditions for Text and Data Mining
3. **Obtain** your TDM Client Token
4. **Configure** the token in your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "semantic-scholar": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "WILEY_TDM_CLIENT_TOKEN": "your-token-here"
      }
    }
  }
}
```

> **Requirements:**
>
> - You must have institutional access or subscription to download content
> - Academic subscribers can access subscribed content for non-commercial research at no extra cost
> - Rate limits: 3 articles/second, 60 requests/10 minutes

> **Note:**
>
> - The Semantic Scholar API allows up to 100 requests per 5 minutes. To access a higher rate limit, visit [Semantic Scholar](https://www.semanticscholar.org/product/api#Partner-Form) to request authentication for your project.

## Features

### 🔍 **Comprehensive Paper Search**

- **Basic Search**: Simple keyword-based paper discovery
- **Advanced Search**: Multi-filter search with year ranges, citation thresholds, field of study filters, and publication type restrictions
- **Title Matching**: Find papers by closest title match with confidence scoring
- **Batch Operations**: Retrieve multiple papers efficiently (up to 500 papers per request)

### 👥 **Author Discovery & Analysis**

- Search authors by name or affiliation
- Retrieve detailed author profiles with metrics (h-index, citation counts, paper counts)
- Access complete publication lists for any author

### 📊 **Citation Network Analysis**

- Explore papers that cite a specific work
- Analyze reference lists and citation patterns
- Multi-depth citation network traversal for comprehensive impact analysis

### 📚 **Field-Specific Research**

- Browse top papers by academic field
- Filter research by publication venues
- Access open access publications specifically

### 📄 **Full-Text Access & Download**

#### arXiv Papers
- Search arXiv repository directly with customizable query parameters
- Download and extract full-text from arXiv PDFs
- In-memory PDF processing with automatic text extraction
- Support for all arXiv paper formats (new style: 2301.12345, old style: hep-ex/0307015)

#### Wiley Papers
- Download and extract text from Wiley academic papers
- Support for institutional access and open access content
- Requires Wiley TDM Client Token for full access (see configuration below)

#### DOI Resolution
- Fetch content from any DOI URL
- Automatic redirect handling to publisher sites
- Extract metadata and available content
