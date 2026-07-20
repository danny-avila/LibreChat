'use strict';

/** 삭제된 채팅 탭 (항목 11): 목록 / 복원 / 최종 삭제 */
(function () {
  const A = window.BklAdmin;

  async function load() {
    const tbody = document.getElementById('deleted-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/deleted-convos?limit=500');
      document.getElementById('deleted-sub').textContent =
        '사용자가 삭제한 채팅 (삭제 후 ' + j.retention_days + '일 경과 시 자동 최종 삭제)';
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">삭제된 채팅이 없습니다</td></tr>';
        return;
      }
      tbody.innerHTML = j.data.map((c) => `<tr>
        <td style="white-space:nowrap">${A.fmtKST(c.deleted_at)}</td>
        <td><div class="user-cell"><span class="user-name">${A.escHtml(c.user_name || '—')}</span><span class="user-email">${A.escHtml(c.user_email || '')}</span></div></td>
        <td class="text-clip" title="${A.escHtml(c.title)}">${A.escHtml(c.title)}</td>
        <td>${A.fmtNum(c.msg_count)}</td>
        <td style="white-space:nowrap">${A.fmtDate(c.purge_at)}</td>
        <td style="white-space:nowrap">
          <button class="btn-refresh" data-act="restore" data-cid="${A.escHtml(c.conversation_id)}">복원</button>
          <button class="btn-refresh btn-danger" data-act="purge" data-cid="${A.escHtml(c.conversation_id)}">최종 삭제</button>
        </td>
      </tr>`).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cid = btn.dataset.cid;
          try {
            if (btn.dataset.act === 'restore') {
              await A.sendJSON('POST', '/deleted-convos/restore', { conversation_id: cid });
            } else {
              if (!confirm('이 채팅과 모든 메시지를 영구 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return;
              await A.sendJSON('DELETE', '/deleted-convos', { conversation_id: cid });
            }
            load();
          } catch (e) {
            alert('실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  A.registerTab('deleted', { load });
})();
