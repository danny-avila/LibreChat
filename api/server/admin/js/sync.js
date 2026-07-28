'use strict';

/** 일배치 동기화 탭 (DAILY_SYNC_DESIGN §8):
 * - 기준일·유형 선택 → 변경사항 미리보기(dry_run) / 동기화 실행
 * - 실행 중 job 진행 상태 polling (phase 별 done/total/failed)
 * - 최근 실행 이력
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

  async function loadHistory() {
    const tbody = document.getElementById('sync-history-tbody');
    try {
      const j = await A.getJSON('/sync/daily/history?limit=30');
      const syncs = j.syncs || [];
      if (!syncs.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="9">실행 이력이 없습니다</td></tr>';
        return;
      }
      tbody.innerHTML = syncs.map((s) => {
        const cs = s.changes_summary || {};
        const rs = s.result_summary || {};
        const running = s.status === 'running' || s.status === 'accepted';
        const dur = rs.duration_seconds != null ? Math.round(rs.duration_seconds) + 's' : '—';
        return `<tr${running ? ` class="sync-running" data-job="${A.escHtml(s.job_id)}"` : ''}>
          <td style="white-space:nowrap;">${A.fmtKST(s.started_at || s.created_at)}</td>
          <td>${A.escHtml(s.date || '')}</td>
          <td>${A.escHtml(STATUS_LABELS[s.status] || s.status)}</td>
          <td>${A.fmtNum(cs.new_cases)}</td>
          <td>${A.fmtNum(cs.metadata_changes)}</td>
          <td>${A.fmtNum(cs.file_changes)}</td>
          <td>${rs.success != null ? A.fmtNum(rs.success) : '—'}</td>
          <td>${rs.failed != null ? A.fmtNum(rs.failed) : '—'}</td>
          <td>${dur}</td>
        </tr>`;
      }).join('');
      // 실행 중 job 이 있으면 자동으로 진행 패널 연결
      const runningRow = tbody.querySelector('tr.sync-running');
      if (runningRow && !pollTimer) {
        startPolling(runningRow.dataset.job);
      }
    } catch (e) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">이력 조회 실패: ${A.escHtml(e.message)}</td></tr>`;
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

  A.registerTab('sync', { load });
})();
