const axios = require('axios');
const logger = require('~/config/winston');

class LinkedInService {
  constructor() {
    this.clientId = process.env.LINKEDIN_CLIENT_ID;
    this.clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    this.redirectUri = process.env.LINKEDIN_REDIRECT_URI;
    this.apiBaseUrl = 'https://api.linkedin.com/v2';
    
    if (!this.clientId || !this.clientSecret) {
      logger.warn('[LinkedInService] LinkedIn credentials not configured');
    }
  }

  /**
   * Generate OAuth authorization URL
   * @param {string} state - Secure state parameter
   * @returns {string} Authorization URL
   */
  getAuthUrl(state) {
    const scopes = [
      'openid',
      'profile',
      'email',
      'w_member_social', // Post on behalf of user
    ];

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      state: state,
      scope: scopes.join(' '),
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code from callback
   * @returns {Promise<Object>} Token data
   */
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        refreshToken: response.data.refresh_token,
      };
    } catch (error) {
      logger.error('[LinkedIn] Token exchange failed:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for token');
    }
  }

  /**
   * Get user profile information
   * @param {string} accessToken - User's access token
   * @returns {Promise<Object>} User profile data
   */
  async getUserProfile(accessToken) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data;
    } catch (error) {
      logger.error('[LinkedIn] Get profile failed:', error.message);
      throw new Error('Failed to get user profile');
    }
  }

  /**
   * Create a post on LinkedIn
   * @param {string} accessToken - User's access token
   * @param {string} personUrn - User's LinkedIn URN
   * @param {string} content - Post content
   * @param {string} visibility - Post visibility (PUBLIC, CONNECTIONS, LOGGED_IN)
   * @returns {Promise<Object>} Created post data
   */
  async createPost(accessToken, personUrn, content, visibility = 'PUBLIC') {
    try {
      const postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility,
        },
      };

      const response = await axios.post(
        `${this.apiBaseUrl}/ugcPosts`,
        postData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      logger.info('[LinkedIn] Post created successfully');
      return response.data;
    } catch (error) {
      logger.error('[LinkedIn] Create post failed:', error.response?.data || error.message);
      throw new Error('Failed to create post on LinkedIn');
    }
  }

  /**
   * Post a comment on a LinkedIn post
   * @param {string} accessToken - User's access token
   * @param {string} postUrn - URN of the post to comment on
   * @param {string} commentText - Comment text
   * @returns {Promise<Object>} Created comment data
   */
  async postComment(accessToken, postUrn, commentText) {
    try {
      const commentData = {
        actor: 'urn:li:person:CURRENT_USER', // LinkedIn resolves this to current user
        message: {
          text: commentText,
        },
        object: postUrn,
      };

      const response = await axios.post(
        `${this.apiBaseUrl}/socialActions/${encodeURIComponent(postUrn)}/comments`,
        commentData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      logger.info('[LinkedIn] Comment posted successfully');
      return response.data;
    } catch (error) {
      logger.error('[LinkedIn] Post comment failed:', error.response?.data || error.message);
      throw new Error('Failed to post comment on LinkedIn');
    }
  }

  /**
   * Reply to a comment on LinkedIn
   * @param {string} accessToken - User's access token
   * @param {string} commentUrn - URN of the comment to reply to
   * @param {string} replyText - Reply text
   * @returns {Promise<Object>} Created reply data
   */
  async replyToComment(accessToken, commentUrn, replyText) {
    try {
      const replyData = {
        actor: 'urn:li:person:CURRENT_USER',
        message: {
          text: replyText,
        },
        parentComment: commentUrn,
      };

      const response = await axios.post(
        `${this.apiBaseUrl}/socialActions/${encodeURIComponent(commentUrn)}/comments`,
        replyData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      logger.info('[LinkedIn] Reply posted successfully');
      return response.data;
    } catch (error) {
      logger.error('[LinkedIn] Reply to comment failed:', error.response?.data || error.message);
      throw new Error('Failed to reply to comment on LinkedIn');
    }
  }

  /**
   * Get comments on a LinkedIn post
   * @param {string} accessToken - User's access token
   * @param {string} postUrn - URN of the post
   * @returns {Promise<Array>} Array of comments
   */
  async getComments(accessToken, postUrn) {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/socialActions/${encodeURIComponent(postUrn)}/comments`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          params: {
            count: 100, // Get up to 100 comments
          },
        }
      );

      return response.data.elements || [];
    } catch (error) {
      logger.error('[LinkedIn] Get comments failed:', error.response?.data || error.message);
      throw new Error('Failed to get comments from LinkedIn');
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - User's refresh token
   * @returns {Promise<Object>} New token data
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
        refreshToken: response.data.refresh_token || refreshToken,
      };
    } catch (error) {
      logger.error('[LinkedIn] Token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh LinkedIn token');
    }
  }
}

module.exports = new LinkedInService();
