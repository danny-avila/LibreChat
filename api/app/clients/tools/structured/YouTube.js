const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { youtube } = require('@googleapis/youtube');
const { YoutubeTranscript } = require('youtube-transcript');
const { getApiKey } = require('./credentials');
const { logger } = require('~/config');

const description = `YouTube Tool Operations (one action per request):
1. SEARCH VIDEOS (action: search_videos)
   - Required: query (search terms)
   - Optional: maxResults (1-50, default: 5)
   - Use for: Finding videos, exploring content
   Example: query="cooking pasta"

2. GET VIDEO INFO (action: get_video_info)
   - Required: url (YouTube URL or video ID)
   - Use for: Getting video metadata/stats
   Example: url="youtube.com/watch?v=123"

3. GET COMMENTS (action: get_comments)
   - Required: url (YouTube URL or video ID)
   - Optional: maxResults (1-50, default: 10)
   - Use for: Analyzing feedback
   Example: url="videoID", max=10

4. GET TRANSCRIPT (action: get_video_transcript)
   - Required: url (YouTube URL or video ID)
   - Use for: Content analysis, summarization
   Example: url="videoID"

Rules:
- Execute only one action per request
- URL accepts full YouTube link or video ID
- All responses in JSON format
- Use transcript for content questions
- MaxResults must be 1-50
- Focused, single-operation requests only`;

/**
 * @param {import('youtube-transcript').TranscriptResponse[]} transcriptResponse
 */
function parseTranscript(transcriptResponse) {
  if (!Array.isArray(transcriptResponse.transcript)) {
    return '';
  }

  return transcriptResponse.transcript
    .map((entry) => entry.text.trim())
    .filter((text) => text)
    .join(' ');
}

function createYouTubeTool(fields = {}) {
  const envVar = 'YOUTUBE_API_KEY';
  const override = fields.override ?? false;
  const apiKey = fields.apiKey ?? fields[envVar] ?? getApiKey(envVar, override);

  const youtubeClient = youtube({
    version: 'v3',
    auth: apiKey,
  });

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

  async function searchVideos(query, maxResults = 5) {
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
  }

  async function getVideoInfo(url) {
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
  }

  async function getComments(url, maxResults = 10) {
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
  }

  /**
   * @param {string} url - YouTube URL or video ID
   * @returns {Promise<string>}
   */
  async function getVideoTranscript(url) {
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
  }

  const actionHandlers = {
    search_videos: async (input) => {
      if (!input.query) {
        throw new Error('Query required for video search');
      }
      return searchVideos(input.query, input.maxResults);
    },

    get_video_info: async (input) => {
      if (!input.url) {
        throw new Error('URL required for video info');
      }
      return getVideoInfo(input.url);
    },

    get_comments: async (input) => {
      if (!input.url) {
        throw new Error('URL required for comments');
      }
      return getComments(input.url, input.maxResults);
    },

    get_video_transcript: async (input) => {
      if (!input.url) {
        throw new Error('URL required for transcript');
      }
      return getVideoTranscript(input.url);
    },
  };

  return tool(
    async (input) => {
      const handler = actionHandlers[input.action];
      if (!handler) {
        throw new Error(`Unknown action: ${input.action}`);
      }

      return await handler(input);
    },
    {
      name: 'youtube',
      description,
      schema: z.object({
        action: z
          .enum(['search_videos', 'get_video_info', 'get_comments', 'get_video_transcript'])
          .describe('Action to perform'),
        query: z.string().optional().describe('Search query (required for search_videos)'),
        url: z
          .string()
          .optional()
          .describe('YouTube URL or video ID (required for video info/comments/transcript)'),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Number of results (1-50, default varies by action)'),
      }),
    },
  );
}

module.exports = createYouTubeTool;
