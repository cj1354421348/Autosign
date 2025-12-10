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
        // Unauthorized
        removeToken();
        if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
        }
        throw new Error("未授权，请登录");
    }
    if (!resp.ok) {
        throw new Error(await resp.text());
    }
    // Handle empty response (e.g. 204)
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

// Check Auth on load
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path !== "/login" && !getToken()) {
        window.location.href = "/login";
    }
});

// --- Task Functions ---

async function loadDashboard() {
    const container = document.getElementById('task-list');
    container.innerHTML = '正在加载任务...';
    try {
        const tasks = await apiCall('GET', '/api/tasks');
        if (tasks.length === 0) {
            container.innerHTML = '<p>暂无任务，请创建。</p>';
            return;
        }

        let html = '';
        tasks.forEach(task => {
            const statusClass = task.last_result === 'SUCCESS' ? 'status-success' : (task.last_result === 'FAILURE' ? 'status-failure' : '');
            const badge = `<span class="status-badge ${statusClass}">${task.last_result || '等待中'}</span>`;

            html += `
            <div class="card">
                <div style="display:flex; justify-content:space-between;">
                    <h3>${task.name}</h3>
                    ${badge}
                </div>
                <p class="text-muted">${task.mode == 'COOKIE' ? 'Cookie模式' : '密码模式'} | Cron: ${task.schedule}</p>
                <p class="text-muted">上次运行: ${task.last_run ? new Date(task.last_run).toLocaleString() : '从未'}</p>

                <div style="margin-top: 1rem; display:flex; gap:0.5rem;">
                    <button id="run-btn-${task.id}" onclick="runTask('${task.id}')" class="btn btn-sm btn-success">立即运行</button>
                    <a href="/task/${task.id}" class="btn btn-sm btn-primary">编辑</a>
                    <button onclick="deleteTask('${task.id}')" class="btn btn-sm btn-danger">删除</button>
                </div>

                <div style="margin-top:0.5rem;">
                    <details ontoggle="if(this.open) loadLogs('${task.id}', 'logs-${task.id}')">
                        <summary style="cursor:pointer; font-size:0.9em;">查看日志</summary>
                        <div id="logs-${task.id}" style="background:rgba(0,0,0,0.05); padding:0.5rem; border-radius:4px; max-height:200px; overflow:auto;">
                            加载日志...
                        </div>
                    </details>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = `加载任务失败: ${e.message}`;
    }
}

async function runTask(taskId) {
    try {
        const btn = document.getElementById(`run-btn-${taskId}`);
        if (btn) { btn.innerText = "运行中..."; btn.disabled = true; }
        await apiCall('POST', `/api/tasks/${taskId}/run`);
        alert("任务已启动!");
        loadDashboard(); // Reload list to update status if needed, though log update is async
    } catch (e) {
        alert("错误: " + e.message);
    }
}

async function deleteTask(taskId) {
    if (!confirm("确定要删除吗?")) return;
    try {
        await apiCall('DELETE', `/api/tasks/${taskId}`);
        loadDashboard();
    } catch (e) {
        alert("错误: " + e.message);
    }
}

async function loadLogs(taskId, elementId) {
    const container = document.getElementById(elementId);
    container.innerHTML = '加载中...';
    try {
        const logs = await apiCall('GET', `/api/logs/${taskId}`);
        if (logs.length === 0) {
            container.innerHTML = '暂无日志。';
        } else {
            let html = '<table style="width:100%; font-size:0.8rem; border-collapse: collapse;">';
            logs.forEach(log => {
                const color = log.status ? 'var(--success-color)' : 'var(--danger-color)';
                const status = log.status ? '成功' : '失败';
                const safeOutput = log.output.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                html += `<tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                    <td style="padding:4px;">${new Date(log.timestamp).toLocaleString()}</td>
                    <td style="padding:4px; color:${color}; font-weight:bold;">${status}</td>
                    <td style="padding:4px;"><div style="max-height:60px; overflow:auto; white-space:pre-wrap;">${safeOutput}</div></td>
                </tr>`;
            });
            html += '</table>';
            container.innerHTML = html;
        }
    } catch (e) {
        container.innerHTML = '加载日志出错: ' + e.message;
    }
}

// --- Edit Task Page Functions ---

async function loadTaskEditor(taskId) {
    if (!taskId || taskId === 'None') {
        document.getElementById('page-title').innerText = "新建任务";
        return; // New task, empty form
    }

    document.getElementById('page-title').innerText = "编辑任务";
    try {
        const task = await apiCall('GET', `/api/tasks/${taskId}`);

        // Populate Form
        const form = document.getElementById('taskForm');
        form.querySelector('[name=name]').value = task.name;
        form.querySelector('[name=schedule]').value = task.schedule;
        form.querySelector('[name=mode]').value = task.mode;

        toggleMode(); // Update sections

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
    const mode = document.getElementById('mode').value;
    const cookieSection = document.getElementById('section-cookie');
    const passwordSection = document.getElementById('section-password');

    if (mode === 'COOKIE') {
        cookieSection.style.display = 'block';
        passwordSection.style.display = 'none';
    } else {
        cookieSection.style.display = 'none';
        passwordSection.style.display = 'block';
    }
}
