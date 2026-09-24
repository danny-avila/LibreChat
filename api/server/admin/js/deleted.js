'use strict';

/** 삭제된 채팅 탭 (항목 11): 목록 / 내용 조회 / 복원 / 최종 삭제 */
(function () {
  const A = window.BklAdmin;

  /**
   * 대화 내용을 행 아래에 펼친다 (읽기 전용).
   *
   * 복원과 달리 사용자의 채팅 목록에는 아무 영향이 없다 — 서버가
   * `bklDeletedAt` 를 건드리지 않고 조회만 한다.
   */
  async function toggleDetail(tr, conversationId) {
    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('deleted-detail-row')) {
      existing.remove();
      return;
    }

    const detail = document.createElement('tr');
    detail.className = 'deleted-detail-row';
    detail.innerHTML = '<td colspan="6"><div class="msg-loading">대화 내용 로딩 중...</div></td>';
    tr.after(detail);

    const cell = detail.firstElementChild;
    try {
      const j = await A.getJSON(
        '/deleted-convos/messages?conversation_id=' + encodeURIComponent(conversationId),
      );
      if (!j.data.length) {
        cell.innerHTML =
          '<div class="msg-loading">대화 내용이 남아있지 않습니다 (보관 기간 경과 또는 최종 삭제).</div>';
        return;
      }
      const bubbles = j.data
        .map(
          (m) => `
          <div style="display:flex; flex-direction:column; align-items:${m.role === 'user' ? 'flex-end' : 'flex-start'};">
            <div class="msg-bubble ${m.role}">${A.escHtml(m.text || '(내용 없음)')}</div>
            <div class="msg-meta">${A.fmtKST(m.createdAt)}${m.model ? ' · ' + A.escHtml(m.model) : ''}</div>
          </div>`,
        )
        .join('');
      cell.innerHTML =
        '<div class="msg-meta" style="margin-bottom:8px">읽기 전용 — 복원하지 않으므로 사용자의 채팅 목록에는 영향이 없습니다.</div>' +
        '<div style="display:flex; flex-direction:column; gap:8px; padding:0 4px 6px;">' +
        bubbles +
        '</div>';
    } catch (e) {
      cell.innerHTML = '<div class="err-text">' + A.escHtml(e.message) + '</div>';
    }
  }

  async function load() {
    const tbody = document.getElementById('deleted-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/deleted-convos?limit=500');
      document.getElementById('deleted-sub').textContent =
        '사용자가 삭제한 채팅 (삭제 후 ' +
        j.retention_days +
        '일 경과 시 자동 최종 삭제). [보기] 는 복원하지 않고 내용만 확인합니다.';
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
          <button class="btn-refresh" data-act="view" data-cid="${A.escHtml(c.conversation_id)}">보기</button>
          <button class="btn-refresh" data-act="restore" data-cid="${A.escHtml(c.conversation_id)}">복원</button>
          <button class="btn-refresh btn-danger" data-act="purge" data-cid="${A.escHtml(c.conversation_id)}">최종 삭제</button>
        </td>
      </tr>`).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const cid = btn.dataset.cid;
          const act = btn.dataset.act;
          try {
            if (act === 'view') {
              await toggleDetail(btn.closest('tr'), cid);
              return;
            }
            if (act === 'restore') {
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
