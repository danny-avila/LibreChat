const axios = require('axios');
const logger = require('~/config/winston');

class PostizService {
  constructor() {
    this.baseURL = process.env.POSTIZ_API_URL || 'http://localhost:4007/api';
    this.publicApiBaseURL = process.env.POSTIZ_PUBLIC_API_URL || `${this.baseURL.replace(/\/$/, '')}/public/v1`;
    this.apiKey = process.env.POSTIZ_API_KEY;
    // Postiz app (frontend) URL for "Connect" — where users add integrations in the UI
    this.appURL = process.env.POSTIZ_APP_URL || this.baseURL.replace(/\/api\/?$/, '') || 'http://localhost:4007';
    
    if (!this.apiKey) {
      logger.warn('[PostizService] POSTIZ_API_KEY not configured');
    }
  }

  /**
   * Create axios instance with authentication (main API)
   */
  getClient() {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create axios instance for Postiz Public API (v1)
   */
  getPublicClient() {
    return axios.create({
      baseURL: this.publicApiBaseURL,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Get integrations from Postiz (Public API: GET /integrations)
   */
  async getIntegrations() {
    try {
      const client = this.getPublicClient();
      const response = await client.get('/integrations');
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.error('[PostizService] Failed to get integrations:', error.message);
      throw new Error('Failed to fetch integrations from Postiz');
    }
  }

  /**
   * Initiate "connection" by returning Postiz app URL — Postiz has no public API for OAuth.
   * User connects in Postiz UI; we open that page and sync via getIntegrations().
   */
  async initiateConnection(platform, _callbackUrl) {
    const url = `${this.appURL.replace(/\/$/, '')}/integrations/social/${platform}`;
    logger.info(`[PostizService] Connect ${platform} via Postiz UI: ${url}`);
    return {
      url,
      openInNewTab: true,
    };
  }

  /**
   * Get integration details by ID
   * @param {string} integrationId - Postiz integration ID
   */
  async getIntegration(integrationId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/integrations/${integrationId}`);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get integration:', error.message);
      throw new Error('Failed to fetch integration details');
    }
  }

  /**
   * Disconnect integration from Postiz
   * @param {string} integrationId - Postiz integration ID
   */
  async disconnectIntegration(integrationId) {
    try {
      const client = this.getClient();
      await client.delete('/integrations', {
        data: { id: integrationId },
      });
      return true;
    } catch (error) {
      logger.error('[PostizService] Failed to disconnect integration:', error.message);
      throw new Error('Failed to disconnect integration');
    }
  }

  /**
   * Create a post on connected platforms (Public API: POST /posts)
   * @param {Object} postData - Post data
   * @param {string} postData.content - Post text content
   * @param {Array<string>} postData.integrations - Array of integration IDs
   * @param {string} postData.schedule - Optional: ISO date string for scheduling
   * @param {Array<Object>} postData.media - Optional: Media attachments
   */
  async createPost(postData) {
    try {
      const client = this.getPublicClient();
      const response = await client.post('/posts', postData);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to create post:', error.message);
      throw new Error('Failed to create post');
    }
  }

  /**
   * Get post details
   * @param {string} postId - Postiz post ID
   */
  async getPost(postId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/posts/${postId}`);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get post:', error.message);
      throw new Error('Failed to fetch post details');
    }
  }

  /**
   * Delete a post
   * @param {string} postId - Postiz post ID
   */
  async deletePost(postId) {
    try {
      const client = this.getClient();
      await client.delete(`/posts/${postId}`);
      return true;
    } catch (error) {
      logger.error('[PostizService] Failed to delete post:', error.message);
      throw new Error('Failed to delete post');
    }
  }

  /**
   * Get analytics for a post
   * @param {string} postId - Postiz post ID
   */
  async getPostAnalytics(postId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/analytics/post/${postId}`);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get post analytics:', error.message);
      throw new Error('Failed to fetch post analytics');
    }
  }
}

module.exports = new PostizService();
