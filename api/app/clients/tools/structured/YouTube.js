const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { youtube } = require('@googleapis/youtube');
const { YoutubeTranscript } = require('youtube-transcript');
const { logger } = require('~/config');

class YouTubeTool extends Tool {
  constructor(fields) {
    super();
    this.name = 'youtube';
    /** @type {boolean} Used to initialize the Tool without necessary variables. */
    this.override = fields.override ?? false;
    let apiKey = fields.YOUTUBE_API_KEY ?? this.getApiKey();
    this.apiKey = apiKey;
    this.description = 'Tool for interacting with YouTube content and data.';

    this.description_for_model = `// YouTube Content Tool - READ CAREFULLY
// This tool has four SEPARATE operations that must follow these rules:

// 1. SEARCH VIDEOS:
//    - Action: search_videos
//    - Required: query (your search term)
//    - Optional: maxResults (between 1-50, default: 5)
//    - Usecases: finding relevant videos, exploring new content, or getting recommendations
//    - Example command: search for "cooking pasta" with max 5 results

// 2. GET VIDEO INFO:
//    - Action: get_video_info
//    - Required: url (full YouTube URL or video ID)
//    - Example command: get info for video "https://youtube.com/watch?v=123"

// 3. GET COMMENTS:
//    - Action: get_comments
//    - Required: url (full YouTube URL or video ID)
//    - Optional: maxResults (between 1-50, default: 10)
//    - Usecases: analyzing user feedback, identifying common issues, or understanding viewer sentiment
//    - Example command: get 10 comments from video "https://youtube.com/watch?v=123"

// 4. GET TRANSCRIPT:
//    - Action: get_video_transcript
//    - Required: url (full YouTube URL or video ID)
//    - Optional: Usecases: in-depth analysis, summarization, or translation of a video
//    - Example command: get transcript for video "https://youtube.com/watch?v=123"

// CRITICAL RULES:
// - One action per request ONLY
// - Never mix different operations
// - maxResults must be between 1-50
// - Video URLs can be full links or video IDs
// - All responses are JSON strings
// - Keep requests focused on one action at a time`;

    this.schema = z.object({
      action: z
        .enum(['search_videos', 'get_video_info', 'get_comments', 'get_video_transcript'])
        .describe('The action to perform. Choose one of the available YouTube operations.'),
      query: z
        .string()
        .optional()
        .describe('Required for search_videos: The search term to find videos.'),
      url: z
        .string()
        .optional()
        .describe(
          'Required for video_info, comments, and transcript: The YouTube video URL or ID.',
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe(
          'Optional: Number of results to return. Default: 5 for search, 10 for comments. Max: 50.',
        ),
    });

    /** @type {import('@googleapis/youtube').youtube_v3.Youtube} */
    this.youtubeClient = youtube({
      version: 'v3',
      auth: this.apiKey,
    });
  }

  getApiKey() {
    const apiKey = process.env.YOUTUBE_API_KEY ?? '';
    if (!apiKey && !this.override) {
      throw new Error('Missing YOUTUBE_API_KEY environment variable.');
    }
    return apiKey;
  }

  async _call(input) {
    try {
      const data = typeof input === 'string' ? JSON.parse(input) : input;

      switch (data.action) {
        case 'search_videos':
          return JSON.stringify(await this.searchVideos(data.query, data.maxResults));
        case 'get_video_info':
          return JSON.stringify(await this.getVideoInfo(data.url));
        case 'get_comments':
          return JSON.stringify(await this.getComments(data.url, data.maxResults));
        case 'get_video_transcript':
          return JSON.stringify(await this.getVideoTranscript(data.url));
        default:
          throw new Error(`Unknown action: ${data.action}`);
      }
    } catch (error) {
      logger.error('[YouTubeTool] Error:', error);
      return JSON.stringify({ error: error.message });
    }
  }

  async searchVideos(query, maxResults = 5) {
    const response = await this.youtubeClient.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults,
    });

    return response.data.items.map((item) => ({
      title: item.snippet.title,
      description: item.snippet.description,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
  }

  async getVideoInfo(url) {
    const videoId = this.extractVideoId(url);
    const response = await this.youtubeClient.videos.list({
      part: 'snippet,statistics',
      id: videoId,
    });

    const video = response.data.items[0];
    return {
      title: video.snippet.title,
      description: video.snippet.description,
      views: video.statistics.viewCount,
      likes: video.statistics.likeCount,
      comments: video.statistics.commentCount,
    };
  }

  async getComments(url, maxResults = 10) {
    const videoId = this.extractVideoId(url);
    const response = await this.youtubeClient.commentThreads.list({
      part: 'snippet',
      videoId: videoId,
      maxResults: maxResults,
    });

    return response.data.items.map((item) => ({
      author: item.snippet.topLevelComment.snippet.authorDisplayName,
      text: item.snippet.topLevelComment.snippet.textDisplay,
      likes: item.snippet.topLevelComment.snippet.likeCount,
    }));
  }

  async getVideoTranscript(url) {
    const videoId = this.extractVideoId(url);
    try {
      // Try to fetch English transcript (most common language)
      try {
        const englishTranscript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        return {
          language: 'English',
          transcript: englishTranscript,
        };
      } catch (error) {
        console.log('English transcript not available, trying German...');
      }

      // If English is not available, try German (very common other language if English is not available)
      try {
        const germanTranscript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'de' });
        return {
          language: 'German',
          transcript: germanTranscript,
        };
      } catch (error) {
        console.log('German transcript not available, fetching default transcript...');
      }

      // If neither is available, try fetch any transcript (which will be alpabetically first in the list)
      const defaultTranscript = await YoutubeTranscript.fetchTranscript(videoId);
      return {
        language: 'Unknown',
        transcript: defaultTranscript,
      };
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return {
        error: `Error fetching transcript: ${error.message}`,
      };
    }
  }

  extractVideoId(url) {
    // First, try to match a raw video ID (11 characters)
    const rawIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    if (rawIdRegex.test(url)) {
      return url;
    }

    // Then try various URL formats

    const regex = new RegExp(
      '(?:youtu\\.be/|youtube(?:\\.com)?/(?:(?:watch\\?v=)|(?:embed/)|' +
        '(?:shorts/)|(?:live/)|(?:v/)|(?:/))?)([a-zA-Z0-9_-]{11})(?:\\S+)?$',
    );
    const match = url.match(regex);
    return match ? match[1] : null;
  }
}

module.exports = YouTubeTool;
