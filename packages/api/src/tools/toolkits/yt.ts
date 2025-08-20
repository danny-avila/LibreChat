import { z } from 'zod';
export const ytToolkit = {
  youtube_search: {
    name: 'youtube_search' as const,
    description: `Search for YouTube videos by keyword or phrase.
- Required: query (search terms to find videos)
- Optional: maxResults (number of videos to return, 1-50, default: 5)
- Returns: List of videos with titles, descriptions, and URLs
- Use for: Finding specific videos, exploring content, research
Example: query="cooking pasta tutorials" maxResults=3` as const,
    schema: z.object({
      query: z.string().describe('Search query terms'),
      maxResults: z.number().int().min(1).max(50).optional().describe('Number of results (1-50)'),
    }),
  },
  youtube_info: {
    name: 'youtube_info' as const,
    description: `Get detailed metadata and statistics for a specific YouTube video.
- Required: url (full YouTube URL or video ID)
- Returns: Video title, description, view count, like count, comment count
- Use for: Getting video metrics and basic metadata
- DO NOT USE FOR VIDEO SUMMARIES, USE TRANSCRIPTS FOR COMPREHENSIVE ANALYSIS
- Accepts both full URLs and video IDs
Example: url="https://youtube.com/watch?v=abc123" or url="abc123"` as const,
    schema: z.object({
      url: z.string().describe('YouTube video URL or ID'),
    }),
  } as const,
  youtube_comments: {
    name: 'youtube_comments',
    description: `Retrieve top-level comments from a YouTube video.
- Required: url (full YouTube URL or video ID)
- Optional: maxResults (number of comments, 1-50, default: 10)
- Returns: Comment text, author names, like counts
- Use for: Sentiment analysis, audience feedback, engagement review
Example: url="abc123" maxResults=20`,
    schema: z.object({
      url: z.string().describe('YouTube video URL or ID'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of comments to retrieve'),
    }),
  } as const,
  youtube_transcript: {
    name: 'youtube_transcript',
    description: `Fetch and parse the transcript/captions of a YouTube video.
- Required: url (full YouTube URL or video ID)
- Returns: Full video transcript as plain text
- Use for: Content analysis, summarization, translation reference
- This is the "Go-to" tool for analyzing actual video content
- Attempts to fetch English first, then German, then any available language
Example: url="https://youtube.com/watch?v=abc123"`,
    schema: z.object({
      url: z.string().describe('YouTube video URL or ID'),
    }),
  } as const,
} as const;
