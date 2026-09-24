'use strict';

/**
 * 사용자 탭 (항목 1·3):
 * - 그룹 필터 + 그룹 인사이트 (시간대 패턴 / 질문 유형 / 주요 키워드)
 *   그룹은 BIMS 조직 API 의 groupSid/groupName 기준이다.
 * - 사용자 클릭 → 세션 목록 → 세션 클릭 → 메시지 열람
 * - 새로고침 시 선택 사용자·펼친 세션·스크롤 위치 보존 (항목 1)
 */
(function () {
  const A = window.BklAdmin;
  const range = A.createRangeFilter('range-users', () => A.reloadAll());

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
      A.getJSON('/usage/by-user' + range.params('limit=2000')),
    ]);
    ui.usageMap = new Map(usageRes.data.map((u) => [u.user_id, u]));
    ui.users = usersRes.data.map((u) => {
      const usage = ui.usageMap.get(String(u._id)) || {};
      return {
        user_id: String(u._id),
        name: u.name || u.bkl_user_nm || u.username || (u.email ? u.email.split('@')[0] : ''),
        email: u.email || '',
        bkl_sid: u.bkl_sid || null,
        group_sid: u.bkl_group_sid ?? null,
        group_name: u.bkl_group_name ?? null,
        div_name: u.bkl_div_name ?? null,
        hq_name: u.bkl_hq_name ?? null,
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

  /** 실제로 존재하는 그룹만 옵션으로 만든다 (sid → 이름, 이름 기준 정렬). */
  function renderGroupFilter() {
    const sel = document.getElementById('group-filter');
    const groups = new Map();
    for (const u of ui.users) {
      if (u.group_sid != null && !groups.has(u.group_sid)) {
        groups.set(u.group_sid, u.group_name);
      }
    }
    const options = [...groups.entries()].sort((a, b) =>
      String(a[1] || a[0]).localeCompare(String(b[1] || b[0]), 'ko'),
    );
    const prev = ui.group;
    sel.innerHTML = '<option value="all">전체</option>' +
      options.map(([sid, name]) => `<option value="${sid}">${A.groupLabel(name)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === String(prev))) sel.value = String(prev);
  }

  /** 현재 선택된 그룹의 표시명 (인사이트 부제목용). */
  function selectedGroupLabel() {
    if (ui.group === 'all') return '전체';
    const user = ui.users.find((u) => String(u.group_sid) === String(ui.group));
    return A.groupLabel(user?.group_name);
  }

  function filteredUsers() {
    let list = ui.users;
    if (ui.group !== 'all') list = list.filter((u) => String(u.group_sid) === String(ui.group));
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

  /** 소속 전체 계층 — 배지에 마우스를 올렸을 때 보여준다. */
  function orgTooltip(u) {
    const parts = [u.hq_name, u.div_name, u.group_name].filter(Boolean);
    return parts.length ? A.escHtml(parts.join(' › ')) : '';
  }

  function renderUsersTable() {
    const list = filteredUsers();
    document.getElementById('users-count').textContent = list.length + '명';
    const tbody = document.getElementById('users-tbody');
    if (!list.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="3">사용자 없음</td></tr>'; return; }
    tbody.innerHTML = list.map((u) => `
      <tr data-uid="${u.user_id}" class="${u.user_id === ui.selectedUserId ? 'selected' : ''}">
        <td><div class="user-cell">
          <span class="user-name">${A.escHtml(u.name)}${u.group_name ? ` <span class="badge" title="${orgTooltip(u)}">${A.groupLabel(u.group_name)}</span>` : ''}</span>
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
      const j = await A.getJSON('/sessions/by-user?user_id=' + encodeURIComponent(userId) + '&' + range.params().slice(1) + '&limit=200');
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
    const label = selectedGroupLabel();
    document.getElementById('group-insights-sub').textContent = label + ' · 로딩 중...';
    try {
      const rangeQ = range.params().slice(1);
      const groupUsers = ui.group === 'all' ? ui.users : ui.users.filter((u) => String(u.group_sid) === String(ui.group));
      const sids = groupUsers.map((u) => u.bkl_sid).filter(Boolean);
      const sidParam = ui.group === 'all' || !sids.length ? '' : '&user_sids=' + encodeURIComponent(sids.join(','));

      const [gi, cat] = await Promise.all([
        A.getJSON('/groups/insights?group_sid=' + encodeURIComponent(ui.group) + '&' + rangeQ),
        A.getJSON('/analytics/query-categories?' + rangeQ + sidParam).catch(() => null),
      ]);
      document.getElementById('group-insights-sub').textContent =
        label + ' · 표본 ' + A.fmtNum(gi.sample_size) + '건';

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

  /* ── 그룹 일괄 동기화 ─────────────────────────────────────── */
  /**
   * 조직 정보가 없거나 오래된 사용자를 채운다.
   *
   * 사용자당 1콜이라 서버가 limit 단위로 끊어 처리하고 남은 수를 돌려준다.
   * 남아 있으면 이어서 진행할지 물어본다.
   */
  async function syncGroups() {
    const btn = document.getElementById('btn-sync-groups');
    btn.disabled = true;
    btn.textContent = '동기화 중...';
    try {
      const r = await A.sendJSON('POST', '/users/sync-groups', {});
      if (r.message) {
        alert(r.message);
      } else {
        const lines = [
          '처리 ' + A.fmtNum(r.processed) + '명 · 그룹 확인 ' + A.fmtNum(r.synced) + '명',
          '그룹 없음 ' + A.fmtNum(r.empty) + '명 · 실패 ' + A.fmtNum(r.failed) + '명',
          '남은 대상 ' + A.fmtNum(r.remaining) + '명',
        ];
        if (r.errors?.length) {
          lines.push('', '오류 예시:', ...r.errors);
        }
        alert(lines.join('\n'));
      }
      await load();
    } catch (e) {
      alert('그룹 동기화 실패: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '그룹 동기화';
    }
  }

  /* ── 엑셀 ─────────────────────────────────────────────────── */
  function exportUsers() {
    const list = filteredUsers();
    if (!list.length) { alert('내보낼 데이터가 없습니다.'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['이름', '이메일', '그룹', '본부', '전문가그룹', '질의', '강화', '활동일', '최근 활동', '모델별'],
      ...list.map((u) => [
        u.name, u.email, u.group_name || '', u.div_name || '', u.hq_name || '',
        u.queries, u.enhances, u.active_days, u.last_active ? A.fmtKST(u.last_active) : '',
        u.by_model.map((m) => `${m.model}:${m.queries}`).join(', '),
      ]),
    ]), '사용자');
    XLSX.writeFile(wb, 'bkl_사용자_' + range.label() + '.xlsx');
  }

  function exportSessions() {
    if (!ui.sessions.length) { alert('내보낼 세션이 없습니다.'); return; }
    const user = ui.users.find((u) => u.user_id === ui.selectedUserId);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['시작', '마지막', '메시지 수', '첫 질의', '제목', '삭제 여부'],
      ...ui.sessions.map((s) => [A.fmtKST(s.started_at), A.fmtKST(s.last_at), s.msg_count, s.first_query, s.title, s.deleted_at ? 'Y' : '']),
    ]), '세션');
    XLSX.writeFile(wb, 'bkl_세션_' + (user?.name || ui.selectedUserId) + '_' + range.label() + '.xlsx');
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
  document.getElementById('btn-sync-groups').addEventListener('click', syncGroups);
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
