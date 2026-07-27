'use strict';

/**
 * BKL 어드민 공통 코어.
 * - BKL_ADMIN_TOKEN Bearer 인증 (localStorage, 401 시 재입력)
 * - 기간 필터 (통계 탭 헤더의 드롭다운) / 탭 전환
 * - fetch / chart / 포맷 유틸
 * 각 탭 모듈은 window.BklAdmin.registerTab(name, { load }) 으로 등록한다.
 */
(function () {
  const TOKEN_KEY = 'bkl_admin_token';
  const API = '/admin-api';
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

  const state = {
    currentTab: 'analytics',
    currentFrom: null,
    currentTo: null,
    currentPreset: '30d',
    charts: {},
  };

  const tabs = {}; // name -> { load }

  /* ── 인증 ─────────────────────────────────────────────────── */
  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }
  function authHeaders() {
    return { Authorization: 'Bearer ' + getToken() };
  }
  function showAuthGate(message) {
    document.getElementById('app').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('auth-error').textContent = message || '';
    setTimeout(() => document.getElementById('auth-token-input').focus(), 50);
  }
  async function verifyToken(token) {
    const r = await fetch(API + '/auth/check', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (r.status === 503) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || '서버에 BKL_ADMIN_TOKEN 이 설정되지 않았습니다');
    }
    return r.ok;
  }
  async function submitToken() {
    const input = document.getElementById('auth-token-input');
    const token = input.value.trim();
    if (!token) return;
    try {
      if (await verifyToken(token)) {
        localStorage.setItem(TOKEN_KEY, token);
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        reloadAll();
      } else {
        document.getElementById('auth-error').textContent = '토큰이 올바르지 않습니다';
      }
    } catch (e) {
      document.getElementById('auth-error').textContent = e.message;
    }
  }

  /* ── fetch ────────────────────────────────────────────────── */
  async function getJSON(path) {
    const r = await fetch(API + path, { headers: authHeaders() });
    if (r.status === 401) {
      showAuthGate('세션이 만료되었습니다. 토큰을 다시 입력하세요.');
      throw new Error('unauthorized');
    }
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || body.detail || path + ' → HTTP ' + r.status);
    }
    return r.json();
  }
  async function sendJSON(method, path, body) {
    const r = await fetch(API + path, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) {
      showAuthGate('세션이 만료되었습니다. 토큰을 다시 입력하세요.');
      throw new Error('unauthorized');
    }
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(b.error || b.detail || path + ' → HTTP ' + r.status);
    }
    return r.json();
  }

  /* ── 날짜/포맷 유틸 ───────────────────────────────────────── */
  function toYMD(d) { return d.toISOString().slice(0, 10); }
  function fmtKST(iso) {
    if (!iso) return '—';
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    return k.toISOString().replace('T', ' ').slice(0, 16);
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function fmtNum(n) { return (n ?? 0).toLocaleString(); }
  function escHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDelta(cur, prev) {
    if (prev == null || prev === 0) return '';
    const pct = ((cur - prev) / prev) * 100;
    const cls = pct >= 0 ? 'delta-up' : 'delta-down';
    const sign = pct >= 0 ? '▲' : '▼';
    return ` <span class="${cls}">${sign}${Math.abs(pct).toFixed(0)}%</span>`;
  }
  function buildRangeParams(extra) {
    let q;
    if (state.currentFrom) {
      q = '?from=' + state.currentFrom + (state.currentTo ? '&to=' + state.currentTo : '');
    } else {
      q = '?days=' + ({ today: 1, '7d': 7, '30d': 30, '365d': 365 }[state.currentPreset] || 30);
    }
    return extra ? q + '&' + extra : q;
  }
  function buildRangeLabel() {
    const todayStr = toYMD(new Date());
    if (state.currentFrom) return state.currentFrom + '_' + (state.currentTo || todayStr);
    const days = { today: 1, '7d': 7, '30d': 30, '365d': 365 }[state.currentPreset] || 30;
    return toYMD(new Date(Date.now() - days * 24 * 3600 * 1000)) + '_' + todayStr;
  }

  /* ── 차트 ─────────────────────────────────────────────────── */
  function makeChart(id, type, labels, datasets, extra = {}) {
    if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
    const ctx = document.getElementById(id);
    if (!ctx) return;
    state.charts[id] = new Chart(ctx, {
      type,
      data: { labels, datasets },
      options: Object.assign({
        maintainAspectRatio: false, animation: { duration: 250 },
        plugins: { legend: { labels: { color: '#374151', boxWidth: 12, font: { size: 12 } } } },
        scales: type === 'doughnut' ? {} : {
          x: { ticks: { color: '#9ca3af', maxRotation: 45, font: { size: 11 } }, grid: { color: '#f3f4f6' } },
          y: { ticks: { color: '#9ca3af', font: { size: 11 } }, grid: { color: '#f3f4f6' }, beginAtZero: true },
        },
      }, extra),
    });
  }

  /* ── 탭 전환 ──────────────────────────────────────────────── */
  function switchTab(tab) {
    if (tab === state.currentTab) return;
    state.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById('panel-' + tab).classList.add('active');
    const mod = tabs[tab];
    if (mod && mod.load) mod.load().catch(console.error);
  }

  /* ── 리로드 ───────────────────────────────────────────────── */
  async function reloadAll() {
    const t0 = Date.now();
    const el = document.getElementById('updated-text');
    el.textContent = '로딩 중...';
    try {
      const mod = tabs[state.currentTab];
      if (mod && mod.load) await mod.load();
      el.textContent = '업데이트 ' + new Date().toLocaleTimeString('ko-KR') + ' (' + (Date.now() - t0) + 'ms)';
    } catch (e) {
      if (e.message !== 'unauthorized') {
        el.innerHTML = '<span class="err-text">오류: ' + escHtml(e.message) + '</span>';
        console.error(e);
      }
    }
  }

  /* ── 기간 필터 (통계 탭 헤더의 드롭다운) ───────────────────── */
  function setupRangeFilter() {
    const wrap = document.getElementById('range-wrap');
    const panel = document.getElementById('range-dropdown');
    const toggle = document.getElementById('btn-range-toggle');
    const label = document.getElementById('range-label');
    const PRESET_LABELS = { today: '오늘', '7d': '최근 7일', '30d': '최근 30일', '365d': '최근 1년' };

    const closeDD = () => { panel.classList.remove('open'); toggle.classList.remove('active'); };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      toggle.classList.toggle('active', open);
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeDD(); });

    panel.querySelectorAll('.range-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.range-option').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentPreset = btn.dataset.preset;
        state.currentFrom = null;
        state.currentTo = null;
        document.getElementById('date-from').value = '';
        document.getElementById('date-to').value = '';
        label.textContent = PRESET_LABELS[btn.dataset.preset] || btn.textContent;
        closeDD();
        reloadAll();
      });
    });

    document.getElementById('btn-dd-apply').addEventListener('click', () => {
      const from = document.getElementById('date-from').value;
      const to = document.getElementById('date-to').value;
      if (!from) return;
      state.currentFrom = from;
      state.currentTo = to || null;
      state.currentPreset = null;
      panel.querySelectorAll('.range-option').forEach((b) => b.classList.remove('active'));
      label.textContent = from + ' ~ ' + (to || toYMD(new Date()));
      closeDD();
      reloadAll();
    });
  }

  /* ── 부트 ─────────────────────────────────────────────────── */
  async function boot() {
    Chart.defaults.color = '#6b7280';
    Chart.defaults.borderColor = '#f3f4f6';
    Chart.defaults.font.family =
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Apple SD Gothic Neo", sans-serif';

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('btn-refresh').addEventListener('click', reloadAll);
    document.getElementById('btn-logout').addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      showAuthGate('');
    });
    document.getElementById('auth-submit').addEventListener('click', submitToken);
    document.getElementById('auth-token-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitToken();
    });
    setupRangeFilter();

    const token = getToken();
    if (!token) {
      showAuthGate('');
      return;
    }
    try {
      if (await verifyToken(token)) {
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        reloadAll();
      } else {
        showAuthGate('저장된 토큰이 유효하지 않습니다. 다시 입력하세요.');
      }
    } catch (e) {
      showAuthGate(e.message);
    }
  }

  window.BklAdmin = {
    state,
    COLORS,
    getJSON,
    sendJSON,
    toYMD,
    fmtKST,
    fmtDate,
    fmtNum,
    fmtDelta,
    escHtml,
    buildRangeParams,
    buildRangeLabel,
    makeChart,
    reloadAll,
    registerTab: (name, mod) => { tabs[name] = mod; },
    boot,
  };
})();
