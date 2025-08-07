const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { youtube } = require('@googleapis/youtube');
const { YoutubeTranscript } = require('youtube-transcript');
const { getApiKey } = require('./credentials');
const { logger } = require('~/config');

function extractVideoId(url) {
  const rawIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  if (rawIdRegex.test(url)) {
    return url;
  }

  const regex = new RegExp(
    '(?:youtu\\.be/|youtube(?:\\.com)?/(?:' +
      '(?:watch\\?v=)|(?:embed/)|(?:shorts/)|(?:live/)|(?:v/)|(?:/))?)' +
      '([a-zA-Z0-9_-]{11})(?:\\S+)?$',
  );
  const match = url.match(regex);
  return match ? match[1] : null;
}

function parseTranscript(transcriptResponse) {
  if (!Array.isArray(transcriptResponse)) {
    return '';
  }

  return transcriptResponse
    .map((entry) => entry.text.trim())
    .filter((text) => text)
    .join(' ')
    .replaceAll('&amp;#39;', "'");
}

function createYouTubeTools(fields = {}) {
  const envVar = 'YOUTUBE_API_KEY';
  const override = fields.override ?? false;
  const apiKey = fields.apiKey ?? fields[envVar] ?? getApiKey(envVar, override);

  const youtubeClient = youtube({
    version: 'v3',
    auth: apiKey,
  });

  const searchTool = tool(
    async ({ query, maxResults = 5 }) => {
      const response = await youtubeClient.search.list({
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: maxResults || 5,
      });
      const result = response.data.items.map((item) => ({
        title: item.snippet.title,
        description: item.snippet.description,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));
      return JSON.stringify(result, null, 2);
    },
    {
      name: 'youtube_search',
      description: `Search for YouTube videos by keyword or phrase.
- Required: query (search terms to find videos)
- Optional: maxResults (number of videos to return, 1-50, default: 5)
- Returns: List of videos with titles, descriptions, and URLs
- Use for: Finding specific videos, exploring content, research
Example: query="cooking pasta tutorials" maxResults=3`,
      schema: z.object({
        query: z.string().describe('Search query terms'),
        maxResults: z.number().int().min(1).max(50).optional().describe('Number of results (1-50)'),
      }),
    },
  );

  const infoTool = tool(
    async ({ url }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
      }

      const response = await youtubeClient.videos.list({
        part: 'snippet,statistics',
        id: videoId,
      });

      if (!response.data.items?.length) {
        throw new Error('Video not found');
      }
      const video = response.data.items[0];

      const result = {
        title: video.snippet.title,
        description: video.snippet.description,
        views: video.statistics.viewCount,
        likes: video.statistics.likeCount,
        comments: video.statistics.commentCount,
      };
      return JSON.stringify(result, null, 2);
    },
    {
      name: 'youtube_info',
      description: `Get detailed metadata and statistics for a specific YouTube video.
- Required: url (full YouTube URL or video ID)
- Returns: Video title, description, view count, like count, comment count
- Use for: Getting video metrics and basic metadata
- DO NOT USE FOR VIDEO SUMMARIES, USE TRANSCRIPTS FOR COMPREHENSIVE ANALYSIS
- Accepts both full URLs and video IDs
Example: url="https://youtube.com/watch?v=abc123" or url="abc123"`,
      schema: z.object({
        url: z.string().describe('YouTube video URL or ID'),
      }),
    },
  );

  const commentsTool = tool(
    async ({ url, maxResults = 10 }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
      }

      const response = await youtubeClient.commentThreads.list({
        part: 'snippet',
        videoId,
        maxResults: maxResults || 10,
      });

      const result = response.data.items.map((item) => ({
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        likes: item.snippet.topLevelComment.snippet.likeCount,
      }));
      return JSON.stringify(result, null, 2);
    },
    {
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
    },
  );

  const transcriptTool = tool(
    async ({ url }) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
      }

      try {
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
          return parseTranscript(transcript);
        } catch (e) {
          logger.error(e);
        }

        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'de' });
          return parseTranscript(transcript);
        } catch (e) {
          logger.error(e);
        }

        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        return parseTranscript(transcript);
      } catch (error) {
        throw new Error(`Failed to fetch transcript: ${error.message}`);
      }
    },
    {
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
    },
  );

  return [searchTool, infoTool, commentsTool, transcriptTool];
}

module.exports = createYouTubeTools;
