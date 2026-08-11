'use strict';

/** 일배치 동기화 탭 (DAILY_SYNC_DESIGN §8):
 * - 기준일·유형 선택 → 변경사항 미리보기(dry_run) / 동기화 실행
 * - 실행 중 job 진행 상태 polling (phase 별 done/total/failed)
 * - 최근 실행 이력 + 검증 배지 (Phase E: Qdrant/OS/PG/grep 대조)
 * - 이력 행 클릭 → per-item 로그 + 검증 리포트 · 수동 검증 실행
 */
(function () {
  const A = window.BklAdmin;

  const PHASE_LABELS = {
    metadata: 'A. 메타데이터 업데이트',
    files: 'B. 파일 변경 처리',
    new_cases: 'C. 신규 사건 인덱싱',
    wiki: 'D. Wiki Rebuild',
  };
  let pollTimer = null;
  let currentJobId = null;

  /* ── 입력값 ─────────────────────────────────────────────── */
  function selectedTypes() {
    const types = [];
    if (document.getElementById('sync-type-new').checked) types.push('new_cases');
    if (document.getElementById('sync-type-meta').checked) types.push('metadata');
    if (document.getElementById('sync-type-files').checked) types.push('files');
    return types;
  }

  function requestBody(dryRun) {
    return {
      date: document.getElementById('sync-date').value || null,
      dry_run: dryRun,
      types: selectedTypes(),
      triggered_by: 'admin-ui',
    };
  }

  function setMsg(text, isError) {
    const el = document.getElementById('sync-msg');
    el.textContent = text || '';
    el.style.color = isError ? '#b91c1c' : '#6b7280';
  }

  /* ── 미리보기 (dry_run) ──────────────────────────────────── */
  async function preview() {
    setMsg('변경사항 조회 중...');
    try {
      const j = await A.sendJSON('POST', '/sync/daily', requestBody(true));
      const s = j.changes_summary || {};
      document.getElementById('sync-preview-sub').textContent =
        `${j.date} · 신규 ${s.new_cases || 0} / 메타 ${s.metadata_changes || 0} / 파일 ${s.file_changes || 0} (source: ${j.source})`;
      const rows = [];
      const c = j.changes || {};
      (c.new_closed_cases || []).forEach((x) => rows.push(
        `<tr><td>신규 종결사건</td><td>${A.escHtml(x.matter_uid)}</td><td class="text-clip">${A.escHtml(x.case_name || x.case_no || '')}</td></tr>`));
      (c.metadata_changes || []).forEach((x) => rows.push(
        `<tr><td>메타데이터</td><td>${A.escHtml(x.matter_uid)}</td><td class="text-clip">${A.escHtml((x.changed_fields || []).join(', '))}</td></tr>`));
      (c.file_changes || []).forEach((m) => (m.changes || []).forEach((f) => rows.push(
        `<tr><td>파일 ${A.escHtml(f.action)}</td><td>${A.escHtml(m.matter_uid)}</td><td class="text-clip">${A.escHtml(f.file_name || f.imanage_doc_id)}</td></tr>`)));
      document.getElementById('sync-preview-tbody').innerHTML =
        rows.length ? rows.join('') : '<tr class="empty-row"><td colspan="3">변경사항이 없습니다</td></tr>';
      document.getElementById('sync-preview-panel').style.display = '';
      setMsg('');
    } catch (e) {
      setMsg('미리보기 실패: ' + e.message, true);
    }
  }

  /* ── 실행 ────────────────────────────────────────────────── */
  async function run() {
    const types = selectedTypes();
    if (!types.length) { setMsg('처리 유형을 하나 이상 선택하세요', true); return; }
    if (!window.confirm('일배치 동기화를 실행합니다. 계속하시겠습니까?')) return;
    setMsg('동기화 시작 중...');
    try {
      const j = await A.sendJSON('POST', '/sync/daily', requestBody(false));
      setMsg(`시작됨: ${j.job_id}`);
      startPolling(j.job_id);
      loadHistory();
    } catch (e) {
      setMsg('실행 실패: ' + e.message, true);
    }
  }

  /* ── 진행 상태 polling ───────────────────────────────────── */
  function startPolling(jobId) {
    currentJobId = jobId;
    stopPolling();
    document.getElementById('sync-progress-panel').style.display = '';
    pollTimer = setInterval(pollOnce, 3000);
    pollOnce();
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  async function pollOnce() {
    if (!currentJobId) return;
    try {
      const job = await A.getJSON('/sync/daily/' + encodeURIComponent(currentJobId));
      renderProgress(job);
      if (job.status === 'completed' || job.status === 'failed') {
        stopPolling();
        loadHistory();
      }
    } catch (e) {
      // 폴링 실패는 다음 tick 재시도
      console.warn('sync poll error', e);
    }
  }

  function renderProgress(job) {
    document.getElementById('sync-progress-sub').textContent =
      `${job.job_id} · ${job.status}` + (job.date ? ` · 기준일 ${job.date}` : '');
    const p = job.progress || {};
    const rows = Object.keys(PHASE_LABELS).map((k) => {
      const v = p[k] || { total: 0, done: 0, failed: 0 };
      const pct = v.total ? Math.round((v.done / v.total) * 100) : 0;
      return `<tr>
        <td style="text-align:left; white-space:nowrap;">${PHASE_LABELS[k]}</td>
        <td style="white-space:nowrap;">${v.done}/${v.total} (${pct}%)</td>
        <td>${v.failed || 0}</td>
        <td class="text-clip">${A.escHtml(v.current || '')}</td>
      </tr>`;
    });
    document.getElementById('sync-progress-tbody').innerHTML = rows.join('');
    const errs = job.errors || [];
    document.getElementById('sync-progress-errors').innerHTML = errs.length
      ? '오류 ' + errs.length + '건:<br>' + errs.slice(0, 10).map((e) =>
          `${A.escHtml(e.matter_uid || '')} ${A.escHtml(e.type || '')} — ${A.escHtml(String(e.error || '').slice(0, 160))}`
        ).join('<br>')
      : '';
  }

  /* ── 이력 ────────────────────────────────────────────────── */
  const STATUS_LABELS = { completed: '완료', failed: '실패', running: '실행 중', accepted: '대기', pending: '대기' };

  function verifyBadge(rs) {
    const v = (rs || {}).verification;
    if (!v || !v.status) {
      return '<span style="color:#9ca3af;">미검증</span>';
    }
    if (v.status === 'ok') {
      return '<span style="color:#047857; font-weight:600;">일치</span>';
    }
    if (v.status === 'inconsistent') {
      const n = v.mismatch_count != null ? v.mismatch_count : (v.mismatches || []).length;
      return `<span style="color:#b91c1c; font-weight:600;">불일치 ${n}</span>`;
    }
    return '<span style="color:#9ca3af;">항목 없음</span>'; // status === 'empty'
  }

  async function loadHistory() {
    const tbody = document.getElementById('sync-history-tbody');
    try {
      const j = await A.getJSON('/sync/daily/history?limit=30');
      const syncs = j.syncs || [];
      if (!syncs.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="10">실행 이력이 없습니다</td></tr>';
        return;
      }
      tbody.innerHTML = syncs.map((s) => {
        const cs = s.changes_summary || {};
        const rs = s.result_summary || {};
        const running = s.status === 'running' || s.status === 'accepted';
        const dur = rs.duration_seconds != null ? Math.round(rs.duration_seconds) + 's' : '—';
        return `<tr class="sync-row${running ? ' sync-running' : ''}" data-job="${A.escHtml(s.job_id)}" style="cursor:pointer;">
          <td style="white-space:nowrap;">${A.fmtKST(s.started_at || s.created_at)}</td>
          <td>${A.escHtml(s.date || '')}</td>
          <td>${A.escHtml(STATUS_LABELS[s.status] || s.status)}</td>
          <td>${A.fmtNum(cs.new_cases)}</td>
          <td>${A.fmtNum(cs.metadata_changes)}</td>
          <td>${A.fmtNum(cs.file_changes)}</td>
          <td>${rs.success != null ? A.fmtNum(rs.success) : '—'}</td>
          <td>${rs.failed != null ? A.fmtNum(rs.failed) : '—'}</td>
          <td>${dur}</td>
          <td style="white-space:nowrap;">${verifyBadge(rs)}</td>
        </tr>`;
      }).join('');
      // 실행 중 job 이 있으면 자동으로 진행 패널 연결
      const runningRow = tbody.querySelector('tr.sync-running');
      if (runningRow && !pollTimer) {
        startPolling(runningRow.dataset.job);
      }
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="10">이력 조회 실패: ${A.escHtml(e.message)}</td></tr>`;
    }
  }

  /* ── 실행 상세: per-item 로그 + 검증 ─────────────────────── */
  let detailJobId = null;
  const LOG_STATUS_LABELS = { success: '성공', failed: '실패', skipped: '건너뜀', partial: '부분' };
  const LOG_TYPE_LABELS = {
    new_case: '신규 사건', metadata: '메타데이터', file_add: '파일 추가',
    file_modify: '파일 수정', file_delete: '파일 삭제', wiki_rebuild: 'Wiki',
  };

  function renderVerifyReport(v) {
    const el = document.getElementById('sync-verify-report');
    if (!v || !v.status) {
      el.innerHTML = '<span style="color:#9ca3af;">아직 검증되지 않았습니다. "검증 실행"을 눌러 스토리지(Qdrant · OpenSearch · PostgreSQL · grep) 반영 상태를 대조할 수 있습니다.</span>';
      return null;
    }
    const byType = Object.entries(v.by_type || {}).map(([k, s]) =>
      `${LOG_TYPE_LABELS[k] || k} ${s.checked}건${s.mismatch ? ` (불일치 ${s.mismatch})` : ''}`).join(' · ');
    const head = v.status === 'ok'
      ? '<span style="color:#047857; font-weight:600;">✓ 스토리지 일치</span>'
      : v.status === 'inconsistent'
        ? `<span style="color:#b91c1c; font-weight:600;">✗ 불일치 ${v.mismatch_count}건</span>`
        : '<span style="color:#9ca3af;">검증 대상 항목 없음</span>';
    let html = `<div>${head} — 검사 ${v.checked}건, 제외 ${v.skipped || 0}건`
      + (v.checked_at ? ` · ${A.fmtKST(v.checked_at)}` : '') + '</div>';
    if (byType) html += `<div style="margin-top:4px; color:#6b7280; font-size:12px;">${A.escHtml(byType)}</div>`;
    if (v.note) html += `<div style="margin-top:4px; color:#9ca3af; font-size:12px;">${A.escHtml(v.note)}</div>`;
    const mm = v.mismatches || [];
    if (mm.length) {
      html += '<div style="margin-top:8px; font-size:12px; color:#b91c1c;">'
        + mm.slice(0, 20).map((m) =>
            `${A.escHtml(LOG_TYPE_LABELS[m.change_type] || m.change_type || '')} `
            + `${A.escHtml(m.matter_uid || '')} ${A.escHtml(m.file_name || m.doc_id || '')} — `
            + `기대: ${A.escHtml(m.expected || '')} / 실제: ${A.escHtml(JSON.stringify(m.actual || {}))}`
          ).join('<br>')
        + (mm.length > 20 ? `<br>… 외 ${mm.length - 20}건` : '')
        + '</div>';
    }
    el.innerHTML = html;
    // 불일치 항목 하이라이트 키 (doc_id 우선, 없으면 matter_uid)
    const keys = new Set();
    mm.forEach((m) => { if (m.doc_id) keys.add('d:' + m.doc_id); else if (m.matter_uid) keys.add('m:' + (m.change_type || '') + ':' + m.matter_uid); });
    return keys;
  }

  function renderDetailLog(entries, mismatchKeys) {
    const tbody = document.getElementById('sync-detail-tbody');
    if (!entries.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">처리 항목이 없습니다</td></tr>';
      return;
    }
    tbody.innerHTML = entries.map((e) => {
      const d = e.detail || {};
      const label = d.file_name || e.imanage_doc_id || '';
      const info = e.status === 'failed'
        ? (d.error || d.reason || '')
        : (d.error || d.reason || d.warning || (d.chunks != null ? `chunks ${d.chunks}` : '') || (d.wiki_status || ''));
      const isMismatch = mismatchKeys && (
        (e.doc_id && mismatchKeys.has('d:' + e.doc_id)) ||
        (e.matter_uid && mismatchKeys.has('m:' + (e.change_type || '') + ':' + e.matter_uid))
      );
      const color = e.status === 'failed' ? '#b91c1c' : e.status === 'skipped' ? '#9ca3af' : e.status === 'partial' ? '#b45309' : '#047857';
      return `<tr${isMismatch ? ' style="background:#fef2f2;"' : ''}>
        <td>${e.id != null ? e.id : ''}</td>
        <td style="white-space:nowrap;">${A.escHtml(LOG_TYPE_LABELS[e.change_type] || e.change_type || '')}</td>
        <td>${A.escHtml(e.matter_uid || '')}</td>
        <td class="text-clip" title="${A.escHtml(e.doc_id || '')}">${A.escHtml(label || e.doc_id || '')}</td>
        <td style="color:${color}; white-space:nowrap;">${A.escHtml(LOG_STATUS_LABELS[e.status] || e.status)}${isMismatch ? ' ⚠' : ''}</td>
        <td class="text-clip">${A.escHtml(String(info).slice(0, 200))}</td>
      </tr>`;
    }).join('');
  }

  async function openDetail(jobId) {
    detailJobId = jobId;
    const panel = document.getElementById('sync-detail-panel');
    panel.style.display = '';
    document.getElementById('sync-detail-sub').textContent = jobId;
    document.getElementById('sync-detail-tbody').innerHTML =
      '<tr class="empty-row"><td colspan="6">로딩 중...</td></tr>';
    document.getElementById('sync-verify-report').innerHTML = '';
    try {
      const [job, log] = await Promise.all([
        A.getJSON('/sync/daily/' + encodeURIComponent(jobId)),
        A.getJSON('/sync/daily/' + encodeURIComponent(jobId) + '/log?limit=500'),
      ]);
      const keys = renderVerifyReport((job.result_summary || {}).verification);
      renderDetailLog(log.entries || [], keys);
      const total = log.total != null ? log.total : (log.entries || []).length;
      document.getElementById('sync-detail-sub').textContent =
        `${jobId} · 항목 ${total}건` + ((log.entries || []).length < total ? ` (${log.entries.length}건 표시)` : '');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      document.getElementById('sync-detail-tbody').innerHTML =
        `<tr class="empty-row"><td colspan="6">상세 조회 실패: ${A.escHtml(e.message)}</td></tr>`;
    }
  }

  async function runVerify() {
    if (!detailJobId) return;
    const btn = document.getElementById('btn-sync-verify');
    btn.disabled = true;
    btn.textContent = '검증 중...';
    try {
      const v = await A.sendJSON('POST', '/sync/daily/' + encodeURIComponent(detailJobId) + '/verify', {});
      const keys = renderVerifyReport(v);
      // 하이라이트 갱신을 위해 로그 재렌더
      const log = await A.getJSON('/sync/daily/' + encodeURIComponent(detailJobId) + '/log?limit=500');
      renderDetailLog(log.entries || [], keys);
      loadHistory(); // 배지 갱신
    } catch (e) {
      document.getElementById('sync-verify-report').innerHTML =
        `<span style="color:#b91c1c;">검증 실패: ${A.escHtml(e.message)}</span>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '검증 실행';
    }
  }

  /* ── 탭 로드 ─────────────────────────────────────────────── */
  async function load() {
    const dateInput = document.getElementById('sync-date');
    if (!dateInput.value) {
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
      dateInput.value = A.toYMD(yesterday);
    }
    await loadHistory();
  }

  document.getElementById('btn-sync-preview').addEventListener('click', preview);
  document.getElementById('btn-sync-run').addEventListener('click', run);
  document.getElementById('sync-preview-close').addEventListener('click', () => {
    document.getElementById('sync-preview-panel').style.display = 'none';
  });
  document.getElementById('sync-history-refresh').addEventListener('click', loadHistory);
  document.getElementById('sync-history-tbody').addEventListener('click', (ev) => {
    const row = ev.target.closest('tr.sync-row');
    if (row && row.dataset.job) openDetail(row.dataset.job);
  });
  document.getElementById('btn-sync-verify').addEventListener('click', runVerify);
  document.getElementById('sync-detail-close').addEventListener('click', () => {
    document.getElementById('sync-detail-panel').style.display = 'none';
    detailJobId = null;
  });

  A.registerTab('sync', { load });
})();
