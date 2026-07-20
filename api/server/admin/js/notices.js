'use strict';

/** 공지 탭 (항목 10): 팝업/배너 공지 CRUD */
(function () {
  const A = window.BklAdmin;
  let editingId = null;

  function toLocalInput(iso) {
    if (!iso) return '';
    const k = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    return k.toISOString().slice(0, 16);
  }
  function fromLocalInput(v) {
    return v ? new Date(v + ':00+09:00').toISOString() : null;
  }

  function showForm(notice) {
    editingId = notice ? notice.bannerId : null;
    document.getElementById('notice-form').style.display = 'flex';
    document.getElementById('notice-title').value = notice?.title || '';
    document.getElementById('notice-type').value = notice?.type === 'banner' ? 'banner' : 'popup';
    document.getElementById('notice-message').value = notice?.message || '';
    document.getElementById('notice-from').value = toLocalInput(notice?.displayFrom);
    document.getElementById('notice-to').value = toLocalInput(notice?.displayTo);
    document.getElementById('notice-persistable').checked = notice?.persistable === true;
  }
  function hideForm() {
    editingId = null;
    document.getElementById('notice-form').style.display = 'none';
  }

  async function saveNotice() {
    const body = {
      title: document.getElementById('notice-title').value.trim(),
      type: document.getElementById('notice-type').value,
      message: document.getElementById('notice-message').value,
      displayFrom: fromLocalInput(document.getElementById('notice-from').value),
      displayTo: fromLocalInput(document.getElementById('notice-to').value),
      persistable: document.getElementById('notice-persistable').checked,
    };
    if (!body.message.trim()) { alert('내용을 입력하세요.'); return; }
    try {
      if (editingId) {
        await A.sendJSON('PUT', '/notices/' + encodeURIComponent(editingId), body);
      } else {
        await A.sendJSON('POST', '/notices', body);
      }
      hideForm();
      load();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  let noticesCache = [];

  async function load() {
    const tbody = document.getElementById('notices-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/notices');
      noticesCache = j.data;
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">등록된 공지가 없습니다</td></tr>';
        return;
      }
      tbody.innerHTML = j.data.map((n) => `<tr>
        <td>${n.type === 'banner' ? '<span class="badge">배너</span>' : '<span class="badge badge-enhance">팝업</span>'}</td>
        <td>${A.escHtml(n.title || '—')}</td>
        <td class="text-clip" title="${A.escHtml(n.message)}">${A.escHtml((n.message || '').slice(0, 80))}</td>
        <td style="white-space:nowrap">${A.fmtDate(n.displayFrom)} ~ ${n.displayTo ? A.fmtDate(n.displayTo) : '무제한'}</td>
        <td>${n.persistable ? 'Y' : ''}</td>
        <td style="white-space:nowrap">
          <button class="btn-refresh" data-act="edit" data-id="${A.escHtml(n.bannerId)}">수정</button>
          <button class="btn-refresh btn-danger" data-act="del" data-id="${A.escHtml(n.bannerId)}">삭제</button>
        </td>
      </tr>`).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (btn.dataset.act === 'edit') {
            showForm(noticesCache.find((n) => n.bannerId === id));
            return;
          }
          if (!confirm('이 공지를 삭제할까요?')) return;
          try {
            await A.sendJSON('DELETE', '/notices/' + encodeURIComponent(id));
            load();
          } catch (e) {
            alert('삭제 실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  document.getElementById('btn-new-notice').addEventListener('click', () => showForm(null));
  document.getElementById('btn-notice-cancel').addEventListener('click', hideForm);
  document.getElementById('btn-notice-save').addEventListener('click', saveNotice);

  A.registerTab('notices', { load });
})();
