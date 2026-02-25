const axios = require('axios');
const logger = require('~/config/winston');

class PostizService {
  constructor() {
    this.baseURL = process.env.POSTIZ_API_URL || 'http://localhost:4007/api';
    this.apiKey = process.env.POSTIZ_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('[PostizService] POSTIZ_API_KEY not configured');
    }
  }

  /**
   * Create axios instance with authentication
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
   * Get user's integrations from Postiz
   */
  async getIntegrations() {
    try {
      const client = this.getClient();
      const response = await client.get('/integrations/list');
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get integrations:', error.message);
      throw new Error('Failed to fetch integrations from Postiz');
    }
  }

  /**
   * Initiate OAuth connection for a platform
   * @param {string} platform - Platform name (linkedin, x, instagram, etc.)
   * @param {string} callbackUrl - URL to redirect after OAuth
   */
  async initiateConnection(platform, callbackUrl) {
    try {
      const client = this.getClient();
      logger.info(`[PostizService] Initiating ${platform} connection with callback: ${callbackUrl}`);
      
      // Try the correct Postiz API endpoint for initiating OAuth
      // The endpoint should return an OAuth URL to redirect the user to
      const response = await client.post(`/integrations/${platform}/connect`, {
        redirect: callbackUrl,
      });
      
      logger.info(`[PostizService] ${platform} connection initiated successfully`);
      return response.data;
    } catch (error) {
      // Log detailed error information
      if (error.response) {
        logger.error(`[PostizService] Postiz API error for ${platform}:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.config?.url,
        });
        
        // Return more specific error message
        const errorMessage = error.response.data?.message || error.response.data?.error || error.message;
        throw new Error(`Postiz error: ${errorMessage}`);
      } else if (error.request) {
        logger.error(`[PostizService] No response from Postiz for ${platform}:`, error.message);
        throw new Error('Cannot connect to Postiz. Please ensure Postiz is running.');
      } else {
        logger.error(`[PostizService] Failed to initiate ${platform} connection:`, error.message);
        throw new Error(`Failed to initiate ${platform} connection: ${error.message}`);
      }
    }
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
   * Create a post on connected platforms
   * @param {Object} postData - Post data
   * @param {string} postData.content - Post text content
   * @param {Array<string>} postData.integrations - Array of integration IDs
   * @param {string} postData.schedule - Optional: ISO date string for scheduling
   * @param {Array<Object>} postData.media - Optional: Media attachments
   */
  async createPost(postData) {
    try {
      const client = this.getClient();
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
