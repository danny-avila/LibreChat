const { logger } = require('@librechat/data-schemas');
const { Banner } = require('~/db/models');

/**
 * Retrieves the current active banner.
 * @returns {Promise<Object|null>} The active banner object or null if no active banner is found.
 */
const getBanner = async (user) => {
  try {
    const now = new Date();
    const banner = await Banner.findOne({
      displayFrom: { $lte: now },
      $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
      type: 'banner',
    }).lean();

    if (!banner || banner.isPublic || user) {
      return banner;
    }

    return null;
  } catch (error) {
    logger.error('[getBanners] Error getting banners', error);
    throw new Error('Error getting banners');
  }
};

/**
 * BKL (항목 10): 현재 노출 기간인 popup 공지 목록을 반환한다.
 * 클라이언트는 bannerId 별 localStorage ack 로 미확인 공지만 모달로 띄운다
 * (persistable 이면 매번 노출).
 */
const getPopupNotices = async (user) => {
  try {
    const now = new Date();
    const query = {
      displayFrom: { $lte: now },
      $or: [{ displayTo: { $gte: now } }, { displayTo: null }],
      type: 'popup',
    };
    const notices = await Banner.find(query).sort({ displayFrom: -1 }).lean();
    return notices.filter((notice) => notice.isPublic || user);
  } catch (error) {
    logger.error('[getPopupNotices] Error getting popup notices', error);
    throw new Error('Error getting popup notices');
  }
};

module.exports = { getBanner, getPopupNotices };
