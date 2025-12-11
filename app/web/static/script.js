const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('token');
}

function setToken(token) {
    localStorage.setItem('token', token);
}

function removeToken() {
    localStorage.removeItem('token');
}

async function apiCall(method, url, body = null) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
        method: method,
        headers: headers,
    };
    if (body) options.body = JSON.stringify(body);

    const resp = await fetch(url, options);
    if (resp.status === 401) {
        removeToken();
        if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
        }
        throw new Error("未授权，请登录");
    }
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : {};
}

async function login(username, password) {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const resp = await fetch('/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
    });

    if (!resp.ok) {
        throw new Error("登录失败");
    }
    const data = await resp.json();
    setToken(data.access_token);
    window.location.href = "/";
}

function logout() {
    removeToken();
    window.location.href = "/login";
}

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path !== "/login" && !getToken()) {
        window.location.href = "/login";
    }
});

// --- Task Functions ---

async function loadDashboard() {
    const container = document.getElementById('task-list');
    try {
        const tasks = await apiCall('GET', '/api/tasks');
        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="alert alert-info d-inline-block">暂无任务，请点击右上角新建。</div>
                </div>`;
            return;
        }

        let html = '';
        tasks.forEach(task => {
            let badgeClass = 'bg-secondary';
            if (task.last_result === 'SUCCESS') badgeClass = 'bg-success';
            if (task.last_result === 'FAILURE') badgeClass = 'bg-danger';

            const badge = `<span class="badge ${badgeClass}">${task.last_result || '等待中'}</span>`;
            const modeLabel = task.mode == 'COOKIE' ? '<span class="badge text-bg-light border">Cookie</span>' : '<span class="badge text-bg-dark border">密码</span>';
            const lastRun = task.last_run ? new Date(task.last_run).toLocaleString() : '从未运行';
            const nextRun = task.next_run_time ? new Date(task.next_run_time).toLocaleString() : '未计划';
            const nextRunTimeIso = task.next_run_time || '';

            html += `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm">
                    <div class="card-header d-flex justify-content-between align-items-center bg-transparent">
                        <h5 class="card-title mb-0 text-truncate" title="${task.name}">${task.name}</h5>
                        ${badge}
                    </div>
                    <div class="card-body">
                        <div class="mb-2">
                             ${modeLabel} <small class="text-muted ms-2"><i class="bi bi-clock"></i> ${task.schedule}</small>
                        </div>
                        <p class="card-text small text-muted mb-1">
                            上次运行: ${lastRun}
                        </p>
                        <p class="card-text small text-muted mb-1">
                            下次运行: ${nextRun}
                        </p>
                        <p class="card-text small text-muted">
                             <span class="countdown-timer fw-bold text-primary" data-next-run="${nextRunTimeIso}"></span>
                        </p>
                    </div>
                    <div class="card-footer bg-transparent border-top-0 d-flex justify-content-between">
                         <button id="run-btn-${task.id}" onclick="runTask('${task.id}')" class="btn btn-sm btn-outline-success">
                            <i class="bi bi-play-fill"></i> 运行
                         </button>
                         <div class="btn-group">
                            <button onclick="showLogs('${task.id}', '${task.name}')" class="btn btn-sm btn-outline-secondary">
                                <i class="bi bi-journal-text"></i> 日志
                            </button>
                            <a href="/task/${task.id}" class="btn btn-sm btn-outline-primary">
                                <i class="bi bi-pencil"></i> 编辑
                            </a>
                            <button onclick="deleteTask('${task.id}')" class="btn btn-sm btn-outline-danger">
                                <i class="bi bi-trash"></i>
                            </button>
                         </div>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
        updateCountdowns(); // Initial update
    } catch (e) {
        container.innerHTML = `<div class="col-12"><div class="alert alert-danger">加载任务失败: ${e.message}</div></div>`;
    }
}

function updateCountdowns() {
    document.querySelectorAll('.countdown-timer').forEach(el => {
        const nextRunAttr = el.getAttribute('data-next-run');
        if (!nextRunAttr) {
            el.innerText = '';
            return;
        }
        const nextRun = new Date(nextRunAttr).getTime();
        const now = new Date().getTime();
        const diff = nextRun - now;

        if (diff <= 0) {
            el.innerText = '准备运行...';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let text = '倒计时: ';
        if (days > 0) text += `${days}天 `;
        text += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        el.innerText = text;
    });
}
setInterval(updateCountdowns, 1000);

async function runTask(taskId) {
    try {
        const btn = document.getElementById(`run-btn-${taskId}`);
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>`;
            btn.disabled = true;

            await apiCall('POST', `/api/tasks/${taskId}/run`);
            // Wait a bit then refresh
            setTimeout(() => {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                loadDashboard();
            }, 1000);
        } else {
            await apiCall('POST', `/api/tasks/${taskId}/run`);
            loadDashboard();
        }
    } catch (e) {
        alert("错误: " + e.message);
        loadDashboard();
    }
}

async function deleteTask(taskId) {
    if (!confirm("确定要删除此任务吗?")) return;
    try {
        await apiCall('DELETE', `/api/tasks/${taskId}`);
        loadDashboard();
    } catch (e) {
        alert("错误: " + e.message);
    }
}

// Global Modal instance
let logModal;

async function showLogs(taskId, taskName) {
    // Initializes modal if not already
    if (!logModal) {
        const el = document.getElementById('logModal');
        logModal = new bootstrap.Modal(el);
    }

    // Update Title
    document.getElementById('logModalLabel').innerText = `日志: ${taskName}`;
    const body = document.getElementById('logModalBody');
    body.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-secondary" role="status"></div></div>';

    logModal.show();

    try {
        const logs = await apiCall('GET', `/api/logs/${taskId}`);
        if (logs.length === 0) {
            body.innerHTML = '<div class="alert alert-light text-center">暂无日志记录。</div>';
        } else {
            let html = '<div class="list-group list-group-flush">';
            logs.forEach(log => {
                const colorClass = log.status ? 'text-success' : 'text-danger';
                const icon = log.status ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-x-circle-fill"></i>';
                // HTML Escape output
                const safeOutput = log.output.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");

                html += `
                <div class="list-group-item bg-transparent">
                    <div class="d-flex w-100 justify-content-between mb-1">
                        <small class="${colorClass} fw-bold">${icon} ${log.status ? '成功' : '失败'}</small>
                        <small class="text-muted">${new Date(log.timestamp).toLocaleString()}</small>
                    </div>
                    <pre class="mb-0 p-2 bg-body-tertiary border rounded" style="font-size: 0.85em;">${safeOutput}</pre>
                </div>`;
            });
            html += '</div>';
            body.innerHTML = html;
        }
    } catch (e) {
        body.innerHTML = `<div class="alert alert-danger">加载日志失败: ${e.message}</div>`;
    }
}

// --- Edit Task Page Functions ---

async function loadTaskEditor(taskId) {
    const titleEl = document.getElementById('page-title');
    if (!titleEl) return; // Not on edit page

    if (!taskId || taskId === 'None') {
        titleEl.innerText = "新建任务";
        toggleMode(); // Ensure correct section is shown for default selection
        return;
    }

    titleEl.innerText = "编辑任务";
    try {
        const task = await apiCall('GET', `/api/tasks/${taskId}`);
        const form = document.getElementById('taskForm');
        form.querySelector('[name=name]').value = task.name;
        form.querySelector('[name=schedule]').value = task.schedule;
        form.querySelector('[name=mode]').value = task.mode;

        toggleMode();

        if (task.mode === 'COOKIE') {
            form.querySelector('[name=cookie_signin_url]').value = task.config.signin_url || '';
            form.querySelector('[name=cookie_value]').value = task.config.cookie || '';
            form.querySelector('[name=cookie_method]').value = task.config.method || 'GET';
            form.querySelector('[name=cookie_headers]').value = JSON.stringify(task.config.headers || {}, null, 2);
        } else {
            form.querySelector('[name=pwd_login_url]').value = task.config.login_url || '';
            form.querySelector('[name=pwd_login_payload]').value = JSON.stringify(task.config.login_payload || {}, null, 2);
            form.querySelector('[name=pwd_token_rule]').value = task.config.token_extract_rule || '';
            form.querySelector('[name=pwd_signin_url]').value = task.config.signin_url || '';
            form.querySelector('[name=pwd_signin_headers]').value = JSON.stringify(task.config.signin_headers || { "Authorization": "Bearer {token}" }, null, 2);
        }

    } catch (e) {
        alert("加载任务出错: " + e.message);
        window.location.href = "/";
    }
}

function toggleMode() {
    const modeEl = document.getElementById('mode');
    if (!modeEl) return;
    const mode = modeEl.value;
    const cookieSection = document.getElementById('section-cookie');
    const passwordSection = document.getElementById('section-password');

    if (mode === 'COOKIE') {
        cookieSection.classList.remove('d-none');
        passwordSection.classList.add('d-none');
    } else {
        cookieSection.classList.add('d-none');
        passwordSection.classList.remove('d-none');
    }
}
