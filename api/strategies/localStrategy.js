/**
 * BKL LibreChat — local passport strategy (BIMS-integrated)
 *
 * 변경 사항 (2026-05-26):
 *   기존: 로그인 시 BIMS 응답의 userId/userNm 만 username/name 으로 사용,
 *         sid/roles 같은 핵심 BIMS 식별자는 버려짐.
 *   새: BIMS 응답의 sid, userId, userNm, userClass, roles 를 user document 에
 *      bkl_sid / bkl_user_id / bkl_user_nm / bkl_user_class / bkl_roles 필드로 저장.
 *      → 이후 bklProxy 가 RAG 호출 시 header 로 forward 가능 → ACL filter 가
 *        UserIdentity(staff_sid=...) 로 사건별 권한 체크.
 *
 * 컨테이너 path: /app/api/strategies/localStrategy.js
 */
const { logger } = require('@librechat/data-schemas');
const { Strategy: PassportLocalStrategy } = require('passport-local');
const { findUser, createUser, updateUser } = require('~/models');
const { getBalanceConfig } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { getBklMaintenanceConfig } = require('~/server/services/Config/bklMaintenance');
const crypto = require('crypto');
const mongoose = require('mongoose');

const BKL_AUTH_URL =
  process.env.BKL_AUTH_URL ||
  'https://nb.bkl.co.kr/apis/identity/auth/login';

/**
 * Persist BIMS fields directly via mongoose, bypassing Mongoose strict mode.
 *
 * LibreChat 의 user schema 에는 bkl_* 필드 정의 안 됨. updateUser() 가
 * findByIdAndUpdate({runValidators:true}) 쓰는데 strict mode default 라 schema
 * 에 없는 필드는 silently drop. 그래서 mongoose Model 직접 호출 + strict:false.
 *
 * @param {string|ObjectId} userId
 * @param {Object} bklFields  { bkl_sid, bkl_user_id, bkl_user_nm, ... }
 */
async function persistBklFields(userId, bklFields) {
  const User = mongoose.models.User;
  if (!User) {
    logger.error('[BKL Login] mongoose.models.User not available');
    return null;
  }
  return await User.findByIdAndUpdate(
    userId,
    { $set: bklFields },
    { strict: false, new: true },
  ).lean();
}

async function passportLogin(req, email_or_id, password, done) {
  try {
    const rawInput = email_or_id.trim();
    const id = rawInput.endsWith('@bkl.co.kr')
      ? rawInput.slice(0, -'@bkl.co.kr'.length)
      : rawInput;

    const bklMaintenance = getBklMaintenanceConfig();
    if (bklMaintenance.enabled) {
      logger.warn(`[BKL Login] Maintenance mode blocked login for ID=${id} IP=${req.ip}`);
      return done(null, false, {
        message: bklMaintenance.message,
      });
    }

    // 1. BKL BIMS 인증
    const response = await fetch(BKL_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ id, password, isPC: false }),
    });

    const data = await response.json();

    if (!response.ok || !data.accessToken) {
      logger.error(
        `[BKL Login] [Login failed] [ID: ${id}] [Request-IP: ${req.ip}] - API returned error or no token`,
      );
      return done(null, false, {
        message: '아이디 또는 비밀번호가 올바르지 않습니다.',
      });
    }

    // 2. BKL 응답 정규화
    const bklEmail = data.email || `${id}@bkl.co.kr`;
    const bklName = data.userNm || id;
    const bklUserId = data.userId || id;
    const bklSid = typeof data.sid === 'number' ? data.sid : Number(data.sid) || null;
    const bklUserClass = typeof data.userClass === 'number' ? data.userClass : null;
    const bklRoles = Array.isArray(data.roles) ? data.roles : [];

    // BIMS 가 sid 안 보내면 ACL 매칭 불가 → 명시적으로 경고
    if (!bklSid) {
      logger.warn(
        `[BKL Login] BIMS response missing 'sid' for ID=${id}. ACL filter will be unable to match this user. Response keys: ${Object.keys(data).join(',')}`,
      );
    }

    // BIMS 식별자 공통 fields (createUser / updateUser 양쪽에 사용)
    const bklFields = {
      bkl_sid: bklSid,
      bkl_user_id: bklUserId,
      bkl_user_nm: bklName,
      bkl_user_class: bklUserClass,
      bkl_roles: bklRoles,
      bkl_last_login_at: new Date(),
    };

    // 3. MongoDB 에서 유저 찾기
    let user = await findUser({ email: bklEmail });

    if (!user) {
      // 4. 신규 user 자동 생성
      logger.info(
        `[BKL Login] Auto-registering new user: email=${bklEmail} sid=${bklSid} userId=${bklUserId}`,
      );

      const randomPassword = crypto.randomBytes(32).toString('hex');

      // 1단계: createUser 로 schema 에 정의된 필드만 우선 생성
      const newUserData = {
        name: bklName,
        username: bklUserId, // BIMS userId 그대로 (대소문자 보존)
        email: bklEmail,
        password: randomPassword,
        emailVerified: true,
        provider: 'local',
      };

      const appConfig = await getAppConfig();
      const balanceConfig = getBalanceConfig(appConfig);

      const newUserId = await createUser(newUserData, balanceConfig, false, true);

      // 2단계: BKL 필드는 strict bypass 로 저장 (schema 외 필드)
      await persistBklFields(newUserId, bklFields);

      user = await findUser({ _id: newUserId });
    } else {
      // 5. 기존 user 의 BIMS 필드 최신화 (sid 가 바뀔 일은 거의 없지만, 명확성 위해)
      const needsUpdate =
        user.name !== bklName ||
        !user.emailVerified ||
        user.bkl_sid !== bklSid ||
        user.bkl_user_id !== bklUserId ||
        user.bkl_user_class !== bklUserClass ||
        JSON.stringify(user.bkl_roles || []) !== JSON.stringify(bklRoles);

      if (needsUpdate) {
        // schema 에 정의된 필드는 updateUser 로
        await updateUser(user._id, {
          name: bklName,
          emailVerified: true,
        });
        // BKL 필드는 strict bypass 로 (schema 외)
        await persistBklFields(user._id, bklFields);
        // 메모리상의 user object 도 update (passport 가 이후 user 객체 그대로 씀)
        Object.assign(user, bklFields, { name: bklName, emailVerified: true });
      }
    }

    logger.info(
      `[BKL Login] [Login successful] [ID: ${id}] [Sid: ${bklSid}] [Request-IP: ${req.ip}]`,
    );
    return done(null, user);
  } catch (err) {
    logger.error('[BKL Login] Exception during login', err);
    return done(err);
  }
}

module.exports = () =>
  new PassportLocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      session: false,
      passReqToCallback: true,
    },
    passportLogin,
  );
