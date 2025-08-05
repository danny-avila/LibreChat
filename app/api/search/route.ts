import { type NextRequest, NextResponse } from "next/server"
import type { SearchRequest, SearchResponse } from "@/types"
import { constructSearchUrl, extractHtml, parseSearchResults } from "@/lib/search-utils"

export async function POST(request: NextRequest) {
  try {
    const searchRequest: SearchRequest = await request.json()
    const startTime = Date.now()
    const targetResults = searchRequest.limit || 20
    let allResults: any[] = []
    let totalResultsCount = 0
    let currentPage = 1
    const maxPages = 3 // Limit to 3 pages to avoid excessive requests

    // Validate search request
    if (!searchRequest.query || searchRequest.query.trim().length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "Search query is required" 
      }, { status: 400 })
    }

    // Try to get results from multiple pages if needed
    while (allResults.length < targetResults && currentPage <= maxPages) {
      const firstResult = (currentPage - 1) * 10 + 1 // Search engines typically use 10 results per page
      
      // Construct search URL for current page
      const searchUrl = constructSearchUrl(
        searchRequest.query,
        searchRequest.searchType || "web",
        searchRequest.market || "en-IN", // Default to India
        searchRequest.safeSearch || "moderate",
        firstResult
      )

      console.log(`Searching ${searchRequest.searchType === "news" ? "Google News" : "Bing"} page ${currentPage} with URL: ${searchUrl}`)

      // Extract HTML using our extractor
      const extractResult = await extractHtml(searchUrl)

      if (!extractResult.success || !extractResult.sourceCode) {
        console.error(`Failed to extract page ${currentPage}:`, extractResult.error)
        if (currentPage === 1) {
          throw new Error(extractResult.error || "Failed to extract search results")
        }
        break // If later pages fail, use what we have
      }

      // Parse the HTML to extract search results
      const pageResults = parseSearchResults(
        extractResult.sourceCode, 
        searchRequest.query, 
        searchRequest.searchType || "web"
      )
      
      // Update total results count from first page
      if (currentPage === 1) {
        totalResultsCount = pageResults.totalResults
      }

      // Add new results, avoiding duplicates
      const newResults = pageResults.results.filter((result: any) => 
        !allResults.some((existing: any) => existing.url === result.url)
      )
      
      allResults.push(...newResults)
      
      console.log(`Page ${currentPage}: Found ${pageResults.results.length} results, total so far: ${allResults.length}`)

      // If this page had no results or fewer than expected, probably no more pages
      if (pageResults.results.length === 0 || pageResults.results.length < 5) {
        break
      }

      currentPage++
      
      // Add small delay between requests to be respectful
      if (currentPage <= maxPages) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    // Update position numbers to be sequential
    allResults.forEach((result, index) => {
      result.position = index + 1
    })

    // Limit to requested number of results
    const finalResults = allResults.slice(0, targetResults)

    const searchResponse: SearchResponse = {
      query: searchRequest.query,
      totalResults: Math.max(totalResultsCount, finalResults.length),
      searchTime: Number(((Date.now() - startTime) / 1000).toFixed(1)),
      results: finalResults,
      metadata: {
        scrapingMethod: "Enhanced Multi-Page HTML Extractor",
        extractionTime: new Date().toISOString(),
        sourceSize: "Multiple pages",
        pagesScraped: currentPage - 1,
        market: searchRequest.market || "en-IN",
      },
    }

    console.log(`Search completed: ${finalResults.length} results in ${searchResponse.searchTime}s`)

    return NextResponse.json(searchResponse)
  } catch (error) {
    console.error("Search error:", error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Search failed",
    }, { status: 500 })
  }
}