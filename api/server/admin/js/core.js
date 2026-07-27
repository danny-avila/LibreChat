'use strict';

/**
 * BKL 어드민 공통 코어.
 * - BKL_ADMIN_TOKEN Bearer 인증 (localStorage, 401 시 재입력)
 * - 기간 필터 컴포넌트 (createRangeFilter — 탭마다 독립 인스턴스) / 탭 전환
 * - fetch / chart / 포맷 유틸
 * 각 탭 모듈은 window.BklAdmin.registerTab(name, { load }) 으로 등록한다.
 */
(function () {
  const TOKEN_KEY = 'bkl_admin_token';
  const API = '/admin-api';
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

  const state = {
    currentTab: 'analytics',
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
  /* ── 기간 필터 컴포넌트 ───────────────────────────────────── */
  const PRESET_DAYS = { today: 1, '7d': 7, '30d': 30, '365d': 365 };
  const PRESET_LABELS = { today: '오늘', '7d': '최근 7일', '30d': '최근 30일', '365d': '최근 1년' };

  /**
   * 탭마다 독립적인 기간 필터 드롭다운을 mount 요소에 렌더링한다.
   * 기간 상태는 인스턴스 안에만 있으므로 탭 간에 공유되지 않는다.
   * @param {string} mountId  드롭다운을 그릴 요소 id
   * @param {() => void} onChange  기간 변경 시 호출 (보통 A.reloadAll)
   * @returns {{ params: (extra?: string) => string, label: () => string }}
   */
  function createRangeFilter(mountId, onChange) {
    const rf = { preset: '30d', from: null, to: null };
    const mount = document.getElementById(mountId);
    mount.classList.add('range-wrap');
    mount.innerHTML =
      '<button class="btn-range" type="button">' +
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
      '<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v3M11 1v3M2 7h12"/></svg>' +
      '<span class="range-label">최근 30일</span>' +
      '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6l4 4 4-4"/></svg>' +
      '</button>' +
      '<div class="range-dropdown">' +
      Object.keys(PRESET_DAYS)
        .map((k) => `<button class="range-option${k === '30d' ? ' active' : ''}" type="button" data-preset="${k}">${PRESET_LABELS[k]}</button>`)
        .join('') +
      '<div class="range-divider"></div>' +
      '<div class="custom-dropdown-title">기간 직접 지정</div>' +
      '<div class="date-row"><label>시작</label><input type="date" class="rf-from" /></div>' +
      '<div class="date-row"><label>종료</label><input type="date" class="rf-to" /></div>' +
      '<div class="dropdown-actions"><button class="btn-dd-apply" type="button">적용</button></div>' +
      '</div>';

    const toggle = mount.querySelector('.btn-range');
    const panel = mount.querySelector('.range-dropdown');
    const label = mount.querySelector('.range-label');
    const fromInput = mount.querySelector('.rf-from');
    const toInput = mount.querySelector('.rf-to');

    const closeDD = () => { panel.classList.remove('open'); toggle.classList.remove('active'); };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      toggle.classList.toggle('active', open);
    });
    document.addEventListener('click', (e) => { if (!mount.contains(e.target)) closeDD(); });

    panel.querySelectorAll('.range-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.range-option').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        rf.preset = btn.dataset.preset;
        rf.from = null;
        rf.to = null;
        fromInput.value = '';
        toInput.value = '';
        label.textContent = PRESET_LABELS[rf.preset];
        closeDD();
        if (onChange) onChange();
      });
    });

    panel.querySelector('.btn-dd-apply').addEventListener('click', () => {
      const from = fromInput.value;
      if (!from) return;
      rf.from = from;
      rf.to = toInput.value || null;
      rf.preset = null;
      panel.querySelectorAll('.range-option').forEach((b) => b.classList.remove('active'));
      label.textContent = from + ' ~ ' + (rf.to || toYMD(new Date()));
      closeDD();
      if (onChange) onChange();
    });

    return {
      params(extra) {
        let q;
        if (rf.from) {
          q = '?from=' + rf.from + (rf.to ? '&to=' + rf.to : '');
        } else {
          q = '?days=' + (PRESET_DAYS[rf.preset] || 30);
        }
        return extra ? q + '&' + extra : q;
      },
      label() {
        const todayStr = toYMD(new Date());
        if (rf.from) return rf.from + '_' + (rf.to || todayStr);
        const days = PRESET_DAYS[rf.preset] || 30;
        return toYMD(new Date(Date.now() - days * 24 * 3600 * 1000)) + '_' + todayStr;
      },
    };
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
    createRangeFilter,
    makeChart,
    reloadAll,
    registerTab: (name, mod) => { tabs[name] = mod; },
    boot,
  };
})();
