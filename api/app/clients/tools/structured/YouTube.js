const { ytToolkit } = require('@librechat/api');
const { tool } = require('@langchain/core/tools');
const { youtube } = require('@googleapis/youtube');
const { logger } = require('@librechat/data-schemas');
const { YoutubeTranscript } = require('youtube-transcript');
const { getApiKey } = require('./credentials');

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

  const searchTool = tool(async ({ query, maxResults = 5 }) => {
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
  }, ytToolkit.youtube_search);

  const infoTool = tool(async ({ url }) => {
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
  }, ytToolkit.youtube_info);

  const commentsTool = tool(async ({ url, maxResults = 10 }) => {
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
  }, ytToolkit.youtube_comments);

  const transcriptTool = tool(async ({ url }) => {
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
  }, ytToolkit.youtube_transcript);

  return [searchTool, infoTool, commentsTool, transcriptTool];
}

module.exports = createYouTubeTools;
