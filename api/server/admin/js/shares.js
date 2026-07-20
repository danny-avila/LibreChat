'use strict';

/** 공유 링크 탭 (항목 9): 목록 / 접속 로그 / 활성·비활성 / 만료 변경 / 삭제 */
(function () {
  const A = window.BklAdmin;

  async function showViews(shareId, title) {
    const panel = document.getElementById('share-views-panel');
    const tbody = document.getElementById('share-views-tbody');
    panel.style.display = 'block';
    document.getElementById('share-views-sub').textContent = title;
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/shares/views?share_id=' + encodeURIComponent(shareId) + '&limit=300');
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4">접속 기록 없음</td></tr>';
        return;
      }
      tbody.innerHTML = j.data.map((v) => `<tr>
        <td style="white-space:nowrap">${A.fmtKST(v.ts)}</td>
        <td>${A.escHtml(v.viewer_name || (v.viewer ? 'ID:' + String(v.viewer).slice(-6) : '비로그인'))}</td>
        <td>${A.escHtml(v.ip || '—')}</td>
        <td class="text-clip" title="${A.escHtml(v.ua || '')}">${A.escHtml((v.ua || '—').slice(0, 80))}</td>
      </tr>`).join('');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  async function load() {
    const tbody = document.getElementById('shares-tbody');
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">로딩 중...</td></tr>';
    try {
      const j = await A.getJSON('/shares?limit=1000');
      if (!j.data.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7">공유 링크가 없습니다</td></tr>';
        return;
      }
      tbody.innerHTML = j.data.map((s) => {
        const status = !s.is_public
          ? '<span class="badge badge-inactive">비활성</span>'
          : s.expired
            ? '<span class="badge badge-inactive">만료</span>'
            : '<span class="badge badge-active">활성</span>';
        return `<tr>
          <td style="white-space:nowrap">${A.fmtDate(s.created_at)}</td>
          <td><div class="user-cell"><span class="user-name">${A.escHtml(s.user_name || '—')}</span><span class="user-email">${A.escHtml(s.user_email || '')}</span></div></td>
          <td class="text-clip" title="${A.escHtml(s.title)}">${A.escHtml(s.title)}</td>
          <td>${status}</td>
          <td style="white-space:nowrap">${s.expires_at ? A.fmtDate(s.expires_at) : '무제한'}</td>
          <td>${A.fmtNum(s.view_count)}</td>
          <td style="white-space:nowrap">
            <button class="btn-refresh" data-act="views" data-sid="${A.escHtml(s.share_id)}" data-title="${A.escHtml(s.title)}">로그</button>
            <button class="btn-refresh" data-act="toggle" data-sid="${A.escHtml(s.share_id)}" data-pub="${s.is_public}">${s.is_public ? '비활성화' : '활성화'}</button>
            <button class="btn-refresh" data-act="expiry" data-sid="${A.escHtml(s.share_id)}">만료 변경</button>
            <button class="btn-refresh btn-danger" data-act="del" data-sid="${A.escHtml(s.share_id)}">삭제</button>
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('button[data-act]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const sid = btn.dataset.sid;
          try {
            switch (btn.dataset.act) {
              case 'views':
                return showViews(sid, btn.dataset.title);
              case 'toggle':
                await A.sendJSON('POST', '/shares/set-active', { share_id: sid, is_public: btn.dataset.pub !== 'true' });
                break;
              case 'expiry': {
                const input = prompt('만료일 (YYYY-MM-DD, 비우면 무제한):', '');
                if (input === null) return;
                await A.sendJSON('POST', '/shares/set-expiry', {
                  share_id: sid,
                  expires_at: input.trim() ? input.trim() + 'T23:59:59+09:00' : null,
                });
                break;
              }
              case 'del':
                if (!confirm('이 공유 링크를 삭제할까요?')) return;
                await A.sendJSON('DELETE', '/shares', { share_id: sid });
                break;
            }
            load();
          } catch (e) {
            alert('실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7"><span class="err-text">' + A.escHtml(e.message) + '</span></td></tr>';
    }
  }

  A.registerTab('shares', { load });
})();
