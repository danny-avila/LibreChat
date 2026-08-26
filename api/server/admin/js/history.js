'use strict';

/**
 * 질의 이력 탭 — Harvey Admin History 유사.
 * 전체 사용자의 질의를 기간·사용자·유형·모델·검색어로 필터링해 페이지 단위로
 * 조회하고 (GET /queries/history), 현재 필터 기준으로 엑셀을 내보낸다.
 * 행 클릭 시 절단 없는 전문(全文)을 펼쳐 보여준다.
 */
(function () {
  const A = window.BklAdmin;
  const PAGE_SIZE = 50;
  const EXPORT_MAX = 10000;

  const range = A.createRangeFilter('range-history', () => { state.page = 1; A.reloadAll(); });
  const state = { page: 1, total: 0, rows: [], usersLoaded: false, modelsLoaded: false };

  const el = (id) => document.getElementById(id);

  function currentParams(extra) {
    const parts = [];
    const userId = el('history-user-filter').value;
    const kind = el('history-kind-filter').value;
    const model = el('history-model-filter').value;
    const q = el('history-search').value.trim();
    if (userId) parts.push('user_id=' + encodeURIComponent(userId));
    if (kind) parts.push('kind=' + encodeURIComponent(kind));
    if (model) parts.push('model=' + encodeURIComponent(model));
    if (q) parts.push('q=' + encodeURIComponent(q));
    if (extra) parts.push(extra);
    return range.params(parts.join('&') || undefined);
  }

  /* ── 필터 옵션 (사용자·모델) — 최초 1회만 로드 ─────────────── */
  async function loadUserOptions() {
    if (state.usersLoaded) return;
    const j = await A.getJSON('/users');
    const select = el('history-user-filter');
    const options = (j.data || [])
      .map((u) => ({
        id: String(u._id),
        label: (u.name || u.username || u.email || u._id) + (u.email ? ' (' + u.email + ')' : ''),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    select.innerHTML =
      '<option value="">전체</option>' +
      options.map((o) => `<option value="${A.escHtml(o.id)}">${A.escHtml(o.label)}</option>`).join('');
    state.usersLoaded = true;
  }

  async function loadModelOptions() {
    if (state.modelsLoaded) return;
    // 모델 목록은 전 기간 by-model 집계에서 추출 (별도 엔드포인트 불필요)
    const j = await A.getJSON('/usage/by-model?days=365');
    const select = el('history-model-filter');
    const models = (j.data || []).map((m) => m.model).filter(Boolean);
    select.innerHTML =
      '<option value="">전체</option>' +
      models.map((m) => `<option value="${A.escHtml(m)}">${A.escHtml(m)}</option>`).join('');
    state.modelsLoaded = true;
  }

  /* ── 목록 조회·렌더링 ─────────────────────────────────────── */
  async function loadHistory() {
    const j = await A.getJSON(
      '/queries/history' + currentParams('page=' + state.page + '&page_size=' + PAGE_SIZE),
    );
    state.total = j.total;
    state.rows = j.data || [];
    renderTable();
    renderPager();
  }

  function renderTable() {
    const tbody = el('history-tbody');
    if (!state.rows.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">조건에 맞는 질의가 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = state.rows
      .map((r, i) => {
        const name = r.user_name || (r.user_email ? r.user_email.split('@')[0] : '—');
        const kindBadge =
          r.kind === 'query_enhance'
            ? '<span class="badge badge-enhance">강화</span>'
            : '<span class="badge">질의</span>';
        const previewMark = r.text_source === 'preview' ? ' <span class="badge">미리보기</span>' : '';
        return `<tr class="history-row" data-idx="${i}" style="cursor:pointer;">
          <td style="white-space:nowrap">${A.fmtKST(r.created_at)}</td>
          <td><div class="user-cell"><span class="user-name">${A.escHtml(name)}</span><span class="user-email">${A.escHtml(r.user_email || '')}</span></div></td>
          <td>${r.user_class != null ? '<span class="badge">class ' + r.user_class + '</span>' : '—'}</td>
          <td>${A.escHtml(r.department || '—')}</td>
          <td>${kindBadge}${previewMark}</td>
          <td style="white-space:nowrap">${A.escHtml(r.model || '—')}</td>
          <td class="text-clip history-text" title="클릭하면 전문을 펼칩니다">${A.escHtml((r.text || '').slice(0, 150))}</td>
        </tr>`;
      })
      .join('');

    /* 행 클릭 시 전문 펼침/접힘 토글 */
    tbody.querySelectorAll('.history-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        const next = tr.nextElementSibling;
        if (next && next.classList.contains('history-full-row')) {
          next.remove();
          return;
        }
        const row = state.rows[Number(tr.dataset.idx)];
        const full = document.createElement('tr');
        full.className = 'history-full-row';
        full.innerHTML = `<td colspan="7"><div class="history-full-text">${A.escHtml(row.text || '(내용 없음)')}</div></td>`;
        tr.after(full);
      });
    });
  }

  function renderPager() {
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    el('history-count').textContent = '총 ' + A.fmtNum(state.total) + '건';
    el('history-page-info').textContent = state.page + ' / ' + pages + ' 페이지';
    el('history-prev').disabled = state.page <= 1;
    el('history-next').disabled = state.page >= pages;
  }

  /* ── 엑셀 내보내기 — 현재 필터 기준 최대 1만 건 ───────────── */
  async function exportExcel() {
    const btn = el('btn-export-history');
    btn.disabled = true;
    try {
      const j = await A.getJSON('/queries/history' + currentParams('page=1&page_size=' + EXPORT_MAX));
      if (!j.data?.length) {
        alert('내보낼 데이터가 없습니다.');
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ['시각 (KST)', '사용자', '이메일', '그룹', '부서', '유형', '모델', '질의 내용', '출처'],
          ...j.data.map((r) => [
            A.fmtKST(r.created_at),
            r.user_name || '',
            r.user_email || '',
            r.user_class != null ? 'class ' + r.user_class : '',
            r.department || '',
            r.kind === 'query_enhance' ? '강화' : '질의',
            r.model || '',
            r.text || '',
            r.text_source === 'preview' ? '미리보기(삭제된 채팅)' : '원본',
          ]),
        ]),
        '질의 이력',
      );
      XLSX.writeFile(wb, 'bkl_질의이력_' + range.label() + '.xlsx');
      if (j.total > j.data.length) {
        alert('전체 ' + A.fmtNum(j.total) + '건 중 최근 ' + A.fmtNum(j.data.length) + '건만 내보냈습니다. 기간을 좁혀 다시 시도하세요.');
      }
    } catch (e) {
      console.error('history excel export failed:', e);
      alert('엑셀 내보내기 실패: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── 이벤트 바인딩 ────────────────────────────────────────── */
  const refresh = () => { state.page = 1; loadHistory().catch(console.error); };

  el('history-user-filter').addEventListener('change', refresh);
  el('history-kind-filter').addEventListener('change', refresh);
  el('history-model-filter').addEventListener('change', refresh);

  let searchTimer = null;
  el('history-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 350);
  });

  el('btn-history-reset').addEventListener('click', () => {
    el('history-user-filter').value = '';
    el('history-kind-filter').value = '';
    el('history-model-filter').value = '';
    el('history-search').value = '';
    refresh();
  });

  el('history-prev').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadHistory().catch(console.error); }
  });
  el('history-next').addEventListener('click', () => {
    state.page += 1;
    loadHistory().catch(console.error);
  });
  el('btn-export-history').addEventListener('click', exportExcel);

  async function load() {
    await Promise.all([loadUserOptions(), loadModelOptions()]);
    await loadHistory();
  }

  A.registerTab('history', { load });
})();
