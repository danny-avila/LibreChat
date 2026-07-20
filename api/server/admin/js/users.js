'use strict';

/**
 * 사용자 탭 (항목 1·3):
 * - 그룹(class) 필터 + 그룹 인사이트 (시간대 패턴 / 질문 유형 / 주요 키워드)
 * - 사용자 클릭 → 세션 목록 → 세션 클릭 → 메시지 열람
 * - 새로고침 시 선택 사용자·펼친 세션·스크롤 위치 보존 (항목 1)
 */
(function () {
  const A = window.BklAdmin;

  const ui = {
    users: [],            // 병합된 사용자 목록
    usageMap: new Map(),  // user_id -> usage row
    selectedUserId: null,
    openConvoIds: new Set(),
    sessions: [],
    sortCol: 'active_days',
    sortDir: 'desc',
    searchText: '',
    group: 'all',
  };

  /* ── 사용자 목록 ──────────────────────────────────────────── */
  async function loadUsers() {
    const [usersRes, usageRes] = await Promise.all([
      A.getJSON('/users'),
      A.getJSON('/usage/by-user' + A.buildRangeParams('limit=2000')),
    ]);
    ui.usageMap = new Map(usageRes.data.map((u) => [u.user_id, u]));
    ui.users = usersRes.data.map((u) => {
      const usage = ui.usageMap.get(String(u._id)) || {};
      return {
        user_id: String(u._id),
        name: u.name || u.bkl_user_nm || u.username || (u.email ? u.email.split('@')[0] : ''),
        email: u.email || '',
        bkl_sid: u.bkl_sid || null,
        user_class: u.bkl_user_class ?? null,
        queries: usage.queries || 0,
        enhances: usage.enhances || 0,
        active_days: usage.active_days || 0,
        by_model: usage.by_model || [],
        last_active: usage.last_active || null,
      };
    });
    renderGroupFilter();
    renderUsersTable();
  }

  function renderGroupFilter() {
    const sel = document.getElementById('group-filter');
    const classes = [...new Set(ui.users.map((u) => u.user_class).filter((c) => c != null))].sort((a, b) => a - b);
    const prev = ui.group;
    sel.innerHTML = '<option value="all">전체</option>' +
      classes.map((c) => `<option value="${c}">class ${c}</option>`).join('');
    if ([...sel.options].some((o) => o.value === String(prev))) sel.value = String(prev);
  }

  function filteredUsers() {
    let list = ui.users;
    if (ui.group !== 'all') list = list.filter((u) => String(u.user_class) === String(ui.group));
    if (ui.searchText) {
      const q = ui.searchText.toLowerCase();
      list = list.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    }
    const dir = ui.sortDir === 'asc' ? 1 : -1;
    const col = ui.sortCol;
    return [...list].sort((a, b) => {
      const av = a[col] ?? '', bv = b[col] ?? '';
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  function renderUsersTable() {
    const list = filteredUsers();
    document.getElementById('users-count').textContent = list.length + '명';
    const tbody = document.getElementById('users-tbody');
    if (!list.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="3">사용자 없음</td></tr>'; return; }
    tbody.innerHTML = list.map((u) => `
      <tr data-uid="${u.user_id}" class="${u.user_id === ui.selectedUserId ? 'selected' : ''}">
        <td><div class="user-cell">
          <span class="user-name">${A.escHtml(u.name)}${u.user_class != null ? ' <span class="badge">c' + u.user_class + '</span>' : ''}</span>
          <span class="user-email">${A.escHtml(u.email)}</span>
        </div></td>
        <td>${A.fmtNum(u.active_days)}</td>
        <td>${A.fmtNum(u.queries)}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-uid]').forEach((tr) => {
      tr.addEventListener('click', () => selectUser(tr.dataset.uid));
    });
  }

  /* ── 세션 패널 ────────────────────────────────────────────── */
  async function selectUser(userId, { preserve = false } = {}) {
    if (!preserve) ui.openConvoIds.clear();
    ui.selectedUserId = userId;
    renderUsersTable();
    const user = ui.users.find((u) => u.user_id === userId);
    document.getElementById('session-empty').style.display = 'none';
    document.getElementById('session-content').style.display = 'block';
    document.getElementById('session-user-name').textContent = user ? user.name : userId;
    document.getElementById('session-user-meta').textContent =
      (user?.email || '') + (user?.last_active ? ' · 최근 활동 ' + A.fmtKST(user.last_active) : '');
    document.getElementById('session-user-models').innerHTML =
      (user?.by_model || []).map((m) => `<span class="badge">${A.escHtml(m.model)} ${A.fmtNum(m.queries)}</span>`).join('');

    const listEl = document.getElementById('session-list');
    listEl.innerHTML = '<div class="msg-loading" style="padding:16px 18px;">세션 로딩 중...</div>';
    try {
      const j = await A.getJSON('/sessions/by-user?user_id=' + encodeURIComponent(userId) + '&' + A.buildRangeParams().slice(1) + '&limit=200');
      ui.sessions = j.data;
      renderSessions();
      // 항목 1: 새로고침 전 펼쳐두었던 세션 복원
      for (const cid of ui.openConvoIds) {
        const row = listEl.querySelector(`.session-row[data-cid="${CSS.escape(cid)}"]`);
        if (row) toggleSession(row, cid, { forceOpen: true });
      }
    } catch (e) {
      listEl.innerHTML = '<div class="err-text" style="padding:16px 18px;">' + A.escHtml(e.message) + '</div>';
    }
  }

  function renderSessions() {
    const listEl = document.getElementById('session-list');
    if (!ui.sessions.length) {
      listEl.innerHTML = '<div class="msg-loading" style="padding:16px 18px;">기간 내 대화가 없습니다</div>';
      return;
    }
    listEl.innerHTML = ui.sessions.map((s) => `
      <div class="session-row" data-cid="${A.escHtml(s.conversation_id)}">
        <div class="session-row-header">
          <svg class="session-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4l4 4-4 4"/></svg>
          <div class="session-row-main">
            <div class="session-first-query">${A.escHtml(s.first_query || s.title)}</div>
            <div class="session-meta">
              <span>${A.fmtKST(s.started_at)}</span><span>메시지 ${s.msg_count}건</span>
              ${s.deleted_at ? '<span class="badge badge-inactive">삭제됨</span>' : ''}
            </div>
          </div>
        </div>
        <div class="session-messages"><div class="session-messages-inner"></div></div>
      </div>`).join('');
    listEl.querySelectorAll('.session-row').forEach((row) => {
      row.querySelector('.session-row-header').addEventListener('click', () => toggleSession(row, row.dataset.cid));
    });
  }

  async function toggleSession(row, conversationId, { forceOpen = false } = {}) {
    const wrap = row.querySelector('.session-messages');
    const isOpen = row.classList.contains('open');
    if (isOpen && !forceOpen) {
      row.classList.remove('open');
      wrap.style.maxHeight = '0';
      ui.openConvoIds.delete(conversationId);
      return;
    }
    row.classList.add('open');
    ui.openConvoIds.add(conversationId);
    const inner = wrap.querySelector('.session-messages-inner');
    if (!inner.dataset.loaded) {
      inner.innerHTML = '<div class="msg-loading">메시지 로딩 중...</div>';
      wrap.style.maxHeight = '80px';
      try {
        const j = await A.getJSON('/sessions/messages?conversation_id=' + encodeURIComponent(conversationId));
        inner.innerHTML = j.data.map((m) => `
          <div style="display:flex; flex-direction:column; align-items:${m.role === 'user' ? 'flex-end' : 'flex-start'};">
            <div class="msg-bubble ${m.role}">${A.escHtml(m.text || '(내용 없음)')}</div>
            <div class="msg-meta">${A.fmtKST(m.createdAt)}${m.model ? ' · ' + A.escHtml(m.model) : ''}</div>
          </div>`).join('') || '<div class="msg-loading">메시지 없음</div>';
        inner.dataset.loaded = '1';
      } catch (e) {
        inner.innerHTML = '<div class="err-text">' + A.escHtml(e.message) + '</div>';
      }
    }
    wrap.style.maxHeight = inner.scrollHeight + 30 + 'px';
  }

  /* ── 그룹 인사이트 (항목 3) ───────────────────────────────── */
  async function loadGroupInsights() {
    const panel = document.getElementById('group-insights-panel');
    panel.style.display = 'block';
    document.getElementById('group-insights-sub').textContent =
      (ui.group === 'all' ? '전체' : 'class ' + ui.group) + ' · 로딩 중...';
    try {
      const rangeQ = A.buildRangeParams().slice(1);
      const groupUsers = ui.group === 'all' ? ui.users : ui.users.filter((u) => String(u.user_class) === String(ui.group));
      const sids = groupUsers.map((u) => u.bkl_sid).filter(Boolean);
      const sidParam = ui.group === 'all' || !sids.length ? '' : '&user_sids=' + encodeURIComponent(sids.join(','));

      const [gi, cat] = await Promise.all([
        A.getJSON('/groups/insights?user_class=' + encodeURIComponent(ui.group) + '&' + rangeQ),
        A.getJSON('/analytics/query-categories?' + rangeQ + sidParam).catch(() => null),
      ]);
      document.getElementById('group-insights-sub').textContent =
        (ui.group === 'all' ? '전체' : 'class ' + ui.group) + ' · 표본 ' + A.fmtNum(gi.sample_size) + '건';

      const hourMap = new Map(gi.hourly.map((h) => [h.hour, h.queries]));
      const labels = Array.from({ length: 24 }, (_, i) => i + '시');
      A.makeChart('gi-hourly-chart', 'bar', labels,
        [{ label: '질의', data: labels.map((_, i) => hourMap.get(i) || 0), backgroundColor: 'rgba(99,102,241,.6)' }],
        { plugins: { legend: { display: false } } });

      if (cat?.data?.length) {
        A.makeChart('gi-category-chart', 'doughnut', cat.data.map((c) => c.category),
          [{ data: cat.data.map((c) => c.queries), backgroundColor: A.COLORS, borderWidth: 2, borderColor: '#fff' }],
          { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } } });
      }
      document.getElementById('gi-keywords').innerHTML =
        (gi.top_keywords || []).map((k) => `<span class="gi-kw">${A.escHtml(k.keyword)}<b>${k.count}</b></span>`).join('') ||
        '<span class="msg-loading">키워드 없음</span>';
    } catch (e) {
      document.getElementById('group-insights-sub').innerHTML = '<span class="err-text">' + A.escHtml(e.message) + '</span>';
    }
  }

  /* ── 엑셀 ─────────────────────────────────────────────────── */
  function exportUsers() {
    const list = filteredUsers();
    if (!list.length) { alert('내보낼 데이터가 없습니다.'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['이름', '이메일', '그룹', '질의', '강화', '활동일', '최근 활동', '모델별'],
      ...list.map((u) => [
        u.name, u.email, u.user_class != null ? 'class ' + u.user_class : '',
        u.queries, u.enhances, u.active_days, u.last_active ? A.fmtKST(u.last_active) : '',
        u.by_model.map((m) => `${m.model}:${m.queries}`).join(', '),
      ]),
    ]), '사용자');
    XLSX.writeFile(wb, 'bkl_사용자_' + A.buildRangeLabel() + '.xlsx');
  }

  function exportSessions() {
    if (!ui.sessions.length) { alert('내보낼 세션이 없습니다.'); return; }
    const user = ui.users.find((u) => u.user_id === ui.selectedUserId);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['시작', '마지막', '메시지 수', '첫 질의', '제목', '삭제 여부'],
      ...ui.sessions.map((s) => [A.fmtKST(s.started_at), A.fmtKST(s.last_at), s.msg_count, s.first_query, s.title, s.deleted_at ? 'Y' : '']),
    ]), '세션');
    XLSX.writeFile(wb, 'bkl_세션_' + (user?.name || ui.selectedUserId) + '_' + A.buildRangeLabel() + '.xlsx');
  }

  /* ── 로드 (항목 1: 상태 보존 리로드) ───────────────────────── */
  async function load() {
    const prevSelected = ui.selectedUserId;
    const prevOpen = new Set(ui.openConvoIds);
    const scrollEl = document.getElementById('session-list');
    const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
    await loadUsers();
    if (prevSelected && ui.users.some((u) => u.user_id === prevSelected)) {
      ui.openConvoIds = prevOpen;
      await selectUser(prevSelected, { preserve: true });
      if (scrollEl) scrollEl.scrollTop = prevScroll;
    }
  }

  /* ── 이벤트 ───────────────────────────────────────────────── */
  document.getElementById('group-filter').addEventListener('change', (e) => {
    ui.group = e.target.value;
    renderUsersTable();
  });
  document.getElementById('btn-group-insights').addEventListener('click', loadGroupInsights);
  document.getElementById('btn-close-insights').addEventListener('click', () => {
    document.getElementById('group-insights-panel').style.display = 'none';
  });
  document.getElementById('user-search').addEventListener('input', (e) => {
    ui.searchText = e.target.value.trim();
    renderUsersTable();
  });
  document.querySelectorAll('#users-table th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      if (ui.sortCol === th.dataset.col) {
        ui.sortDir = ui.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        ui.sortCol = th.dataset.col;
        ui.sortDir = th.dataset.dir || 'desc';
      }
      document.querySelectorAll('#users-table th.sortable').forEach((h) => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(ui.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderUsersTable();
    });
  });
  document.getElementById('btn-export-users').addEventListener('click', exportUsers);
  document.getElementById('btn-export-sessions').addEventListener('click', exportSessions);

  A.registerTab('users', { load });
})();
