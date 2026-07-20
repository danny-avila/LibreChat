'use strict';

/** 설정 탭 (항목 7): 사용 가능 모델 목록 + 기본 모델 지정 */
(function () {
  const A = window.BklAdmin;

  function addModelRow(value) {
    const wrap = document.getElementById('settings-models');
    wrap.insertAdjacentHTML('beforeend', `<div class="model-row">
      <input type="text" placeholder="모델명 (예: azure-gpt-4.1)" value="${A.escHtml(value || '')}" />
      <button class="btn-refresh btn-danger m-remove">×</button>
    </div>`);
    const row = wrap.lastElementChild;
    row.querySelector('.m-remove').addEventListener('click', () => { row.remove(); syncDefaultSelect(); });
    row.querySelector('input').addEventListener('input', syncDefaultSelect);
  }

  function currentModels() {
    return [...document.querySelectorAll('#settings-models input')]
      .map((i) => i.value.trim())
      .filter(Boolean);
  }

  function syncDefaultSelect() {
    const sel = document.getElementById('settings-default-model');
    const prev = sel.value;
    const models = currentModels();
    sel.innerHTML = '<option value="">(첫 번째 모델)</option>' +
      models.map((m) => `<option value="${A.escHtml(m)}">${A.escHtml(m)}</option>`).join('');
    if (models.includes(prev)) sel.value = prev;
  }

  async function load() {
    const status = document.getElementById('settings-status');
    try {
      const j = await A.getJSON('/settings/models');
      document.getElementById('settings-endpoint').value = j.data.endpoint || 'BKL DB AI';
      document.getElementById('settings-models').innerHTML = '';
      (j.data.models || []).forEach(addModelRow);
      if (!(j.data.models || []).length) addModelRow('');
      syncDefaultSelect();
      document.getElementById('settings-default-model').value = j.data.defaultModel || '';
      status.textContent = j.overridden
        ? '현재 어드민 설정이 librechat.yaml 값을 덮어쓰고 있습니다.'
        : '현재 librechat.yaml 기본값이 사용 중입니다. 저장하면 어드민 설정이 우선 적용됩니다.';
    } catch (e) {
      status.innerHTML = '<span class="err-text">' + A.escHtml(e.message) + '</span>';
    }
  }

  document.getElementById('btn-add-model').addEventListener('click', () => addModelRow(''));
  document.getElementById('btn-settings-save').addEventListener('click', async () => {
    const models = currentModels();
    if (!models.length) { alert('모델을 1개 이상 입력하세요.'); return; }
    try {
      await A.sendJSON('PUT', '/settings/models', {
        endpoint: document.getElementById('settings-endpoint').value.trim() || 'BKL DB AI',
        models,
        default_model: document.getElementById('settings-default-model').value || null,
      });
      load();
      alert('저장되었습니다. 사용자 화면에는 새 대화부터 반영됩니다.');
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  });
  document.getElementById('btn-settings-reset').addEventListener('click', async () => {
    if (!confirm('어드민 모델 설정을 제거하고 librechat.yaml 값으로 되돌릴까요?')) return;
    try {
      await A.sendJSON('DELETE', '/settings/models');
      load();
    } catch (e) {
      alert('초기화 실패: ' + e.message);
    }
  });

  A.registerTab('settings', { load });
})();
