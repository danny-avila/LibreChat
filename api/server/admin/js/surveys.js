'use strict';

/** 피드백·설문 탭 (항목 5): 피드백 집계/코멘트 + 설문 CRUD/결과 */
(function () {
  const A = window.BklAdmin;
  let editingSurveyId = null;
  let surveysCache = [];

  /* ── 피드백 ───────────────────────────────────────────────── */
  async function loadFeedback() {
    try {
      const j = await A.getJSON('/feedback/summary' + A.buildRangeParams());
      const labels = j.data.map((d) => d.model);
      const up = j.data.map((d) => (d.ratings.find((r) => r.rating === 'thumbsUp')?.count) || 0);
      const down = j.data.map((d) => (d.ratings.find((r) => r.rating === 'thumbsDown')?.count) || 0);
      A.makeChart('feedback-chart', 'bar', labels, [
        { label: '👍', data: up, backgroundColor: 'rgba(16,185,129,.7)' },
        { label: '👎', data: down, backgroundColor: 'rgba(239,68,68,.7)' },
      ]);
    } catch (e) {
      console.warn('feedback summary failed:', e.message);
    }
    const tbody = document.getElementById('feedback-tbody');
    try {
      const j = await A.getJSON('/feedback/list' + A.buildRangeParams('limit=200'));
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4">피드백 없음</td></tr>';
        return;
      }
      tbody.innerHTML = j.data.map((f) => `<tr>
        <td style="white-space:nowrap">${A.fmtKST(f.created_at)}</td>
        <td>${A.escHtml(f.user_name || '—')}</td>
        <td>${f.rating === 'thumbsUp' ? '👍' : f.rating === 'thumbsDown' ? '👎' : A.escHtml(f.rating || '—')}${f.tag ? ' <span class="badge">' + A.escHtml(f.tag) + '</span>' : ''}</td>
        <td class="text-clip" title="${A.escHtml(f.comment || '')}">${A.escHtml(f.comment || '—')}</td>
      </tr>`).join('');
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  /* ── 설문 폼 ──────────────────────────────────────────────── */
  function questionRowHtml(q) {
    return `<div class="question-row">
      <input class="q-text" type="text" placeholder="질문" value="${A.escHtml(q?.text || '')}" />
      <select class="q-type">
        <option value="scale5" ${q?.type === 'scale5' ? 'selected' : ''}>5점 척도</option>
        <option value="choice" ${q?.type === 'choice' ? 'selected' : ''}>객관식</option>
        <option value="text" ${!q || q.type === 'text' ? 'selected' : ''}>주관식</option>
      </select>
      <input class="q-options" type="text" placeholder="선택지 (쉼표 구분)" value="${A.escHtml((q?.options || []).join(', '))}" style="width:200px;" />
      <button class="btn-refresh btn-danger q-remove">×</button>
    </div>`;
  }
  function addQuestionRow(q) {
    const wrap = document.getElementById('survey-questions');
    wrap.insertAdjacentHTML('beforeend', questionRowHtml(q));
    wrap.lastElementChild.querySelector('.q-remove').addEventListener('click', (e) => {
      e.target.closest('.question-row').remove();
    });
  }
  function showSurveyForm(survey) {
    editingSurveyId = survey ? survey.surveyId : null;
    document.getElementById('survey-form').style.display = 'flex';
    document.getElementById('survey-title').value = survey?.title || '';
    document.getElementById('survey-description').value = survey?.description || '';
    document.getElementById('survey-from').value = survey?.displayFrom ? new Date(new Date(survey.displayFrom).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16) : '';
    document.getElementById('survey-to').value = survey?.displayTo ? new Date(new Date(survey.displayTo).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16) : '';
    document.getElementById('survey-questions').innerHTML = '';
    (survey?.questions?.length ? survey.questions : [{ type: 'scale5', text: '전반적인 만족도를 평가해주세요' }]).forEach(addQuestionRow);
  }
  function hideSurveyForm() {
    editingSurveyId = null;
    document.getElementById('survey-form').style.display = 'none';
  }
  async function saveSurvey() {
    const questions = [...document.querySelectorAll('#survey-questions .question-row')].map((row, i) => {
      const type = row.querySelector('.q-type').value;
      const options = row.querySelector('.q-options').value.split(',').map((s) => s.trim()).filter(Boolean);
      return { id: 'q' + (i + 1), text: row.querySelector('.q-text').value.trim(), type, options: type === 'choice' ? options : undefined };
    }).filter((q) => q.text);
    const body = {
      title: document.getElementById('survey-title').value.trim(),
      description: document.getElementById('survey-description').value.trim() || null,
      questions,
      displayFrom: document.getElementById('survey-from').value ? new Date(document.getElementById('survey-from').value + ':00+09:00').toISOString() : null,
      displayTo: document.getElementById('survey-to').value ? new Date(document.getElementById('survey-to').value + ':00+09:00').toISOString() : null,
    };
    if (!body.title || !questions.length) { alert('제목과 1개 이상의 문항이 필요합니다.'); return; }
    try {
      if (editingSurveyId) {
        await A.sendJSON('PUT', '/surveys/' + encodeURIComponent(editingSurveyId), body);
      } else {
        await A.sendJSON('POST', '/surveys', body);
      }
      hideSurveyForm();
      loadSurveys();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  /* ── 설문 목록/결과 ───────────────────────────────────────── */
  async function showResults(surveyId) {
    const panel = document.getElementById('survey-results-panel');
    const body = document.getElementById('survey-results-body');
    panel.style.display = 'block';
    body.innerHTML = '<div class="msg-loading">로딩 중...</div>';
    try {
      const j = await A.getJSON('/surveys/' + encodeURIComponent(surveyId) + '/results');
      document.getElementById('survey-results-sub').textContent =
        j.survey.title + ' · 응답 ' + j.response_count + '명 / 전체 ' + j.users_total + '명 (' + (j.response_rate * 100).toFixed(0) + '%)';
      body.innerHTML = j.by_question.map((q) => {
        let detail;
        if (q.type === 'text') {
          detail = (q.texts || []).map((t) => `<div class="msg-bubble assistant" style="margin-bottom:6px;">${A.escHtml(t)}</div>`).join('') || '<span class="msg-loading">응답 없음</span>';
        } else {
          const entries = Object.entries(q.distribution || {}).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
          const max = Math.max(1, ...entries.map(([, c]) => c));
          detail = entries.map(([k, c]) => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="width:120px; font-size:12px; color:#6b7280;">${A.escHtml(k)}</span>
              <div style="flex:1; background:#f3f4f6; border-radius:4px; height:16px; overflow:hidden;">
                <div style="width:${(c / max) * 100}%; background:#6366f1; height:100%;"></div>
              </div>
              <span style="width:40px; font-size:12px; text-align:right;">${c}</span>
            </div>`).join('') || '<span class="msg-loading">응답 없음</span>';
        }
        return `<div style="margin-bottom:18px;">
          <div style="font-weight:600; font-size:13px; margin-bottom:8px;">${A.escHtml(q.text)} <span class="table-sub">(${q.answered}명 응답)</span></div>
          ${detail}
        </div>`;
      }).join('');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      body.innerHTML = '<span class="err-text">' + A.escHtml(e.message) + '</span>';
    }
  }

  async function loadSurveys() {
    const tbody = document.getElementById('surveys-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/surveys');
      surveysCache = j.data;
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">등록된 설문이 없습니다</td></tr>';
        return;
      }
      const now = Date.now();
      tbody.innerHTML = j.data.map((s) => {
        const live = s.active !== false &&
          (!s.displayFrom || new Date(s.displayFrom).getTime() <= now) &&
          (!s.displayTo || new Date(s.displayTo).getTime() >= now);
        return `<tr>
          <td>${A.escHtml(s.title)}</td>
          <td style="white-space:nowrap">${A.fmtDate(s.displayFrom)} ~ ${s.displayTo ? A.fmtDate(s.displayTo) : '무제한'}</td>
          <td>${live ? '<span class="badge badge-active">노출 중</span>' : '<span class="badge">비노출</span>'}</td>
          <td>${A.fmtNum(s.response_count)}</td>
          <td style="white-space:nowrap">
            <button class="btn-refresh" data-act="results" data-id="${A.escHtml(s.surveyId)}">결과</button>
            <button class="btn-refresh" data-act="edit" data-id="${A.escHtml(s.surveyId)}">수정</button>
            <button class="btn-refresh" data-act="toggle" data-id="${A.escHtml(s.surveyId)}" data-active="${s.active !== false}">${s.active !== false ? '중지' : '재개'}</button>
            <button class="btn-refresh btn-danger" data-act="del" data-id="${A.escHtml(s.surveyId)}">삭제</button>
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            switch (btn.dataset.act) {
              case 'results': return showResults(id);
              case 'edit': return showSurveyForm(surveysCache.find((s) => s.surveyId === id));
              case 'toggle':
                await A.sendJSON('PUT', '/surveys/' + encodeURIComponent(id), { active: btn.dataset.active !== 'true' });
                break;
              case 'del':
                if (!confirm('이 설문과 모든 응답을 삭제할까요?')) return;
                await A.sendJSON('DELETE', '/surveys/' + encodeURIComponent(id));
                break;
            }
            loadSurveys();
          } catch (e) {
            alert('실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  document.getElementById('btn-new-survey').addEventListener('click', () => showSurveyForm(null));
  document.getElementById('btn-add-question').addEventListener('click', () => addQuestionRow(null));
  document.getElementById('btn-survey-cancel').addEventListener('click', hideSurveyForm);
  document.getElementById('btn-survey-save').addEventListener('click', saveSurvey);

  A.registerTab('surveys', { load: async () => { await Promise.all([loadFeedback(), loadSurveys()]); } });
})();
