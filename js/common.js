const U = (() => {
    "use strict";
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const ESC = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ESC[c]);
    function fmtTime(totalSeconds) {
        const s = Math.max(0, Math.round(totalSeconds));
        return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }
    const fmtDate = ts => new Date(ts).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
    });
    function maskEmail(email) {
        const [user, domain] = String(email).split("@");
        return `${(user || "").slice(0, 1)}•••@${domain || ""}`;
    }
    const displayName = entry => entry.name || maskEmail(entry.email);
    function scoreRows(scores, meEmail) {
        if (!scores.length) {
            return '<tr><td colspan="4" class="text-center text-muted py-4">No scores yet. Be the first!</td></tr>';
        }
        return scores.map((s, i) => {
            const me = s.email === meEmail;
            const rank = i < 3 ? `<i class="fa-solid fa-medal rank-${i + 1}" title="Rank ${i + 1}"></i>` : i + 1;
            return `<tr class="${me ? "table-me" : ""}">\n          <td class="text-center fw-bold">${rank}</td>\n          <td>${esc(displayName(s))}${me ? ' <span class="badge bg-primary ms-1">You</span>' : ""}</td>\n          <td class="text-end fw-semibold">${s.percent}%</td>\n          <td class="text-end text-muted">${fmtTime(s.timeTaken)}</td>\n        </tr>`;
        }).join("");
    }
    function download(filename, text, mime = "application/json") {
        const blob = new Blob([ text ], {
            type: `${mime};charset=utf-8`
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
    }
    function readFileText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader;
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }
    function toast(message, type = "success") {
        let host = document.getElementById("toastHost");
        if (!host) {
            host = document.createElement("div");
            host.id = "toastHost";
            host.className = "toast-container position-fixed top-0 end-0 p-3";
            host.style.zIndex = "2000";
            document.body.appendChild(host);
        }
        const icons = {
            success: "fa-circle-check",
            danger: "fa-circle-exclamation",
            warning: "fa-triangle-exclamation",
            info: "fa-circle-info"
        };
        const el = document.createElement("div");
        el.className = `toast align-items-center text-bg-${type} border-0`;
        el.setAttribute("role", type === "danger" ? "alert" : "status");
        el.innerHTML = `<div class="d-flex">\n      <div class="toast-body"><i class="fa-solid ${icons[type] || icons.info} me-2"></i><span></span></div>\n      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>\n    </div>`;
        el.querySelector("span").textContent = message;
        host.appendChild(el);
        el.addEventListener("hidden.bs.toast", () => el.remove());
        new bootstrap.Toast(el, {
            delay: 3500
        }).show();
    }
    function confirmDialog({title: title, body: body, okLabel: okLabel = "Confirm", okClass: okClass = "btn-danger"}) {
        return new Promise(resolve => {
            const el = document.createElement("div");
            el.className = "modal fade";
            el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered"><div class="modal-content">\n        <div class="modal-header"><h2 class="modal-title h5"></h2>\n          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>\n        <div class="modal-body"></div>\n        <div class="modal-footer">\n          <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>\n          <button type="button" class="btn ${okClass}" data-ok></button>\n        </div></div></div>`;
            el.querySelector(".modal-title").textContent = title;
            el.querySelector(".modal-body").textContent = body;
            el.querySelector("[data-ok]").textContent = okLabel;
            document.body.appendChild(el);
            const modal = new bootstrap.Modal(el);
            let result = false;
            el.querySelector("[data-ok]").addEventListener("click", () => {
                result = true;
                modal.hide();
            });
            el.addEventListener("hidden.bs.modal", () => {
                modal.dispose();
                el.remove();
                resolve(result);
            });
            modal.show();
        });
    }
    return {
        $: $,
        $$: $$,
        esc: esc,
        fmtTime: fmtTime,
        fmtDate: fmtDate,
        maskEmail: maskEmail,
        displayName: displayName,
        scoreRows: scoreRows,
        download: download,
        readFileText: readFileText,
        toast: toast,
        confirmDialog: confirmDialog
    };
})();