const express = require('express');
const axios = require('axios');
const router = express.Router();
const SocialDraft = require('../models/SocialDraft');
const requireJwtAuth = require('../middleware/requireJwtAuth');

// Optional: require shared secret when set (for production; leave unset for local/ngrok testing)
const WEBHOOK_SECRET = process.env.SOCIAL_DRAFTS_WEBHOOK_SECRET || '';

const validateWebhookSecret = (req, res, next) => {
  if (!WEBHOOK_SECRET) return next();
  const sent = req.headers['x-social-drafts-secret'] || req.body?.secret;
  if (sent !== WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid or missing webhook secret' });
  }
  next();
};

/** Current user's userId string for DB queries */
const currentUserId = (req) => String(req.user?.id ?? '');

// GET /api/social-drafts – list drafts for the authenticated user (optional ?status=pending)
router.get('/', requireJwtAuth, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const status = req.query.status; // e.g. "pending"
    const filter = { userId };
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }
    const list = await SocialDraft.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, drafts: list });
  } catch (error) {
    console.error('[socialDrafts] GET list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/social-drafts/:id – get one draft (must belong to current user)
router.get('/:id', requireJwtAuth, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const doc = await SocialDraft.findOne({ _id: req.params.id, userId }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true, draft: doc });
  } catch (error) {
    console.error('[socialDrafts] GET by id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/social-drafts/:id/approve – approve or reject; if approved, call n8n resumeUrl
router.post('/:id/approve', requireJwtAuth, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const { approved, selectedPlatforms } = req.body || {};
    const draft = await SocialDraft.findOne({ _id: req.params.id, userId });
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    if (draft.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Draft already processed',
      });
    }
    if (approved === true && draft.resumeUrl) {
      try {
        // Append approval status and draftId as query params so n8n can branch after Wait resumes
        const resumeUrl = new URL(draft.resumeUrl);
        resumeUrl.searchParams.set('draftId', draft._id.toString());
        resumeUrl.searchParams.set('approved', 'true');
        resumeUrl.searchParams.set('selectedPlatforms', JSON.stringify(selectedPlatforms || []));
        await axios.get(resumeUrl.toString(), { timeout: 15000 });
      } catch (err) {
        console.error('[socialDrafts] Resume URL call failed:', err.message);
        return res.status(502).json({
          success: false,
          error: 'Failed to resume workflow: ' + (err.message || 'Unknown error'),
        });
      }
    } else if (approved === false && draft.resumeUrl) {
      // Also resume for rejection so workflow can end gracefully
      try {
        const resumeUrl = new URL(draft.resumeUrl);
        resumeUrl.searchParams.set('draftId', draft._id.toString());
        resumeUrl.searchParams.set('approved', 'false');
        await axios.get(resumeUrl.toString(), { timeout: 15000 });
      } catch (err) {
        console.error('[socialDrafts] Rejection resume URL call failed:', err.message);
        // Don't fail the request - rejection is still saved
      }
    }
    draft.status = approved === true ? 'approved' : 'rejected';
    draft.selectedPlatforms = Array.isArray(selectedPlatforms) ? selectedPlatforms : [];
    await draft.save();
    res.json({ success: true, status: draft.status });
  } catch (error) {
    console.error('[socialDrafts] POST approve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/social-drafts – called by n8n after drafts are generated (before Wait node)
// Body: { userId, drafts, resumeUrl [, executionId, ideaId, rawIdea ] }
router.post('/', validateWebhookSecret, async (req, res) => {
  try {
    const { userId, drafts, resumeUrl, executionId, ideaId, rawIdea } = req.body;

    if (!userId || !resumeUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, resumeUrl',
      });
    }

    if (!drafts || typeof drafts !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid drafts object',
      });
    }

    const doc = await SocialDraft.create({
      userId: String(userId),
      drafts: {
        linkedin: drafts.linkedin ?? '',
        x: drafts.x ?? '',
        instagram: drafts.instagram ?? '',
        facebook: drafts.facebook ?? '',
        farcaster: drafts.farcaster ?? '',
      },
      resumeUrl,
      executionId: executionId ? String(executionId) : '',
      ideaId: ideaId ? String(ideaId) : '',
      rawIdea: rawIdea ? String(rawIdea) : '',
      status: 'pending',
    });

    res.status(201).json({
      success: true,
      draftId: doc._id.toString(),
    });
  } catch (error) {
    console.error('[socialDrafts] POST error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save social draft',
    });
  }
});

// DELETE /api/social-drafts/:id – delete a draft (must belong to current user)
router.delete('/:id', requireJwtAuth, async (req, res) => {
  try {
    const userId = currentUserId(req);
    const doc = await SocialDraft.findOneAndDelete({ _id: req.params.id, userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('[socialDrafts] DELETE error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
