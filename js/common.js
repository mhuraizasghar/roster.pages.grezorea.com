/* Shared UI helpers used by every page. */
const U = (() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  function fmtTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const fmtDate = (ts) => new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function maskEmail(email) {
    const [user, domain] = String(email).split('@');
    return `${(user || '').slice(0, 1)}•••@${domain || ''}`;
  }

  const displayName = (entry) => entry.name || maskEmail(entry.email);

  /** Rows for the high-score table (used on the home page and the result page). */
  function scoreRows(scores, meEmail) {
    if (!scores.length) {
      return '<tr><td colspan="4" class="text-center text-muted py-4">No scores yet. Be the first!</td></tr>';
    }
    return scores
      .map((s, i) => {
        const me = s.email === meEmail;
        const rank = i < 3 ? `<i class="fa-solid fa-medal rank-${i + 1}" title="Rank ${i + 1}"></i>` : i + 1;
        return `<tr class="${me ? 'table-me' : ''}">
          <td class="text-center fw-bold">${rank}</td>
          <td>${esc(displayName(s))}${me ? ' <span class="badge bg-primary ms-1">You</span>' : ''}</td>
          <td class="text-end fw-semibold">${s.percent}%</td>
          <td class="text-end text-muted">${fmtTime(s.timeTaken)}</td>
        </tr>`;
      })
      .join('');
  }

  function download(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function toast(message, type = 'success') {
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.className = 'toast-container position-fixed top-0 end-0 p-3';
      host.style.zIndex = '2000';
      document.body.appendChild(host);
    }
    const icons = {
      success: 'fa-circle-check',
      danger: 'fa-circle-exclamation',
      warning: 'fa-triangle-exclamation',
      info: 'fa-circle-info',
    };
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    el.innerHTML = `<div class="d-flex">
      <div class="toast-body"><i class="fa-solid ${icons[type] || icons.info} me-2"></i><span></span></div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
    el.querySelector('span').textContent = message;
    host.appendChild(el);
    el.addEventListener('hidden.bs.toast', () => el.remove());
    new bootstrap.Toast(el, { delay: 3500 }).show();
  }

  /** Promise-based Bootstrap confirmation dialog. Resolves true if the user confirms. */
  function confirmDialog({ title, body, okLabel = 'Confirm', okClass = 'btn-danger' }) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'modal fade';
      el.tabIndex = -1;
      el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content">
        <div class="modal-header"><h2 class="modal-title h5"></h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn ${okClass}" data-ok></button>
        </div></div></div>`;
      el.querySelector('.modal-title').textContent = title;
      el.querySelector('.modal-body').textContent = body;
      el.querySelector('[data-ok]').textContent = okLabel;
      document.body.appendChild(el);
      const modal = new bootstrap.Modal(el);
      let result = false;
      el.querySelector('[data-ok]').addEventListener('click', () => {
        result = true;
        modal.hide();
      });
      el.addEventListener('hidden.bs.modal', () => {
        modal.dispose();
        el.remove();
        resolve(result);
      });
      modal.show();
    });
  }

  return { $, $$, esc, fmtTime, fmtDate, maskEmail, displayName, scoreRows, download, readFileText, toast, confirmDialog };
})();
