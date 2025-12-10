// 薄荷公益站转盘系统

// 全局变量
let wheelConfig = [];
let userToken = null;
let isSpinning = false;
let currentUser = null;

// 转盘配置：1%, 5%, 10%, 15%, 30%, 39%
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];

// 初始化
window.addEventListener('DOMContentLoaded', async () => {
    // 加载转盘配置
    await loadWheelConfig();

    // 绘制转盘
    drawWheel();

    // 检查是否已登录
    userToken = localStorage.getItem('userToken');

    if (userToken) {
        // 已登录，加载用户信息
        await initApp();
    } else {
        // 未登录，不显示用户信息区域
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
            userInfo.style.display = 'none';
        }
    }

    // 加载排行榜（无需登录）
    await loadRankings();

    // 检查URL参数，如果有token说明是登录回调
    handleTokenFromUrl();

    // 设置鼠标悬停
    setupCanvasHover();
});

// 设置canvas鼠标悬停
function setupCanvasHover() {
    const canvas = document.getElementById('wheelCanvas');
    const tooltip = document.getElementById('wheelTooltip');

    if (!canvas || !tooltip) return;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // 计算鼠标相对于中心的角度
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 只在转盘范围内显示
        if (distance > 240 || distance < 40) {
            tooltip.classList.remove('show');
            return;
        }

        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += 2 * Math.PI;

        // 转换为从顶部开始
        angle = (angle + Math.PI / 2) % (2 * Math.PI);

        // 查找对应的扇形
        let startAngle = 0;
        let foundItem = null;

        for (const item of wheelConfig) {
            const itemAngle = (item.probability / 100) * 2 * Math.PI;
            if (angle >= startAngle && angle < startAngle + itemAngle) {
                foundItem = item;
                break;
            }
            startAngle += itemAngle;
        }

        if (foundItem) {
            tooltip.innerHTML = `
                <strong>${foundItem.label}</strong><br>
                概率: ${foundItem.probability}%
            `;
            tooltip.style.left = (e.clientX - rect.left + 15) + 'px';
            tooltip.style.top = (e.clientY - rect.top + 15) + 'px';
            tooltip.classList.add('show');
        } else {
            tooltip.classList.remove('show');
        }
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.classList.remove('show');
    });
}

// OCID登录
async function loginWithOCID() {
    // 保存当前状态，登录后自动抽奖
    localStorage.setItem('autoSpin', 'true');

    try {
        // 从后端获取OCID授权URL
        const response = await fetch('/api/auth/login');
        const data = await response.json();

        if (data.success && data.authUrl) {
            // 跳转到OCID授权页面
            window.location.href = data.authUrl;
        } else {
            alert('登录服务暂时不可用，请稍后重试');
        }
    } catch (error) {
        alert('登录失败，请稍后重试');
    }
}

// 处理OCID回调（从URL获取token）
function handleTokenFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (error) {
        const msg = urlParams.get('msg');
        alert('登录失败：' + (msg || error));
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    if (token) {
        // 保存token
        localStorage.setItem('userToken', token);
        userToken = token;

        // 清理URL参数
        window.history.replaceState({}, document.title, window.location.pathname);

        // 检查是否需要自动抽奖
        const autoSpin = localStorage.getItem('autoSpin');
        if (autoSpin === 'true') {
            localStorage.removeItem('autoSpin');
            // 刷新页面加载用户信息后自动抽奖
            location.reload();
        } else {
            // 刷新页面加载用户信息
            location.reload();
        }
    }
}

// 初始化应用
async function initApp() {
    try {
        const response = await fetch('/api/user/info', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            currentUser = result.data;
            document.getElementById('mainContent').style.display = 'flex';

            // 显示用户信息
            showUserInfo(result.data.user);

            // 更新按钮状态
            const spinButton = document.getElementById('spinButton');
            if (!result.data.can_spin) {
                spinButton.disabled = true;
                spinButton.textContent = '今日已抽奖';
            }

            // 加载榜单
            await loadRankings();
        } else {
            alert(result.message);
            localStorage.removeItem('userToken');
            location.reload();
        }
    } catch (error) {
        console.error('初始化失败:', error);
        alert('加载失败，请刷新页面重试');
    }
}

// 显示用户信息
function showUserInfo(user) {
    const userInfo = document.getElementById('userInfo');
    userInfo.style.display = 'flex';
    userInfo.innerHTML = `
        <img src="${user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}" 
             alt="Avatar" class="user-avatar">
        <div class="user-details">
            <h3>${user.username}</h3>
            <p>累计获得: ${(user.total_quota / 500).toFixed(0)} 次</p>
        </div>
    `;
}

// 加载转盘配置
async function loadWheelConfig() {
    try {
        const response = await fetch('/api/wheel/config');
        const result = await response.json();

        if (result.success) {
            wheelConfig = result.data;
        }
    } catch (error) {
        // 配置加载失败
    }
}

// 绘制转盘
function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 240;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let startAngle = -Math.PI / 2; // 从顶部开始

    wheelConfig.forEach((item, index) => {
        const angle = (item.probability / 100) * 2 * Math.PI;
        const middleAngle = startAngle + angle / 2;

        // 绘制扇形
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
        ctx.closePath();
        ctx.fillStyle = COLORS[index % COLORS.length];
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 绘制文字 - 沿着半径方向
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(middleAngle);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // 根据扇形大小动态调整字体（特别处理10000次）
        let fontSize;
        if (item.times === 10000) {
            fontSize = 14; // 10000次用最小字体
        } else if (item.probability < 5) {
            fontSize = 16;
        } else if (item.probability < 10) {
            fontSize = 20;
        } else {
            fontSize = 24;
        }
        ctx.font = `bold ${fontSize}px Arial`;

        // 文字位置：较大扇形靠外，较小扇形靠中心
        const textDistance = item.probability < 5 ? radius * 0.50 : radius * 0.65;
        ctx.fillText(item.label, textDistance, 0);

        ctx.restore();

        startAngle += angle;
    });
}

// 转动转盘
async function spin() {
    // 检查是否登录
    if (!userToken) {
        loginWithOCID();
        return;
    }

    if (isSpinning) return;

    isSpinning = true;
    const spinButton = document.getElementById('spinButton');
    spinButton.disabled = true;
    spinButton.textContent = '转动中...';

    try {
        const response = await fetch('/api/lottery/spin', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            // 计算旋转角度
            const prizeData = result.data;
            const prizeIndex = wheelConfig.findIndex(item => item.level === prizeData.level);

            // 计算目标奖项的角度位置（从顶部-90度开始）
            let cumulativeAngle = 0;
            for (let i = 0; i < prizeIndex; i++) {
                cumulativeAngle += (wheelConfig[i].probability / 100) * 360;
            }

            // 加上当前奖项的一半角度，使指针指向中心
            const prizeAngle = (wheelConfig[prizeIndex].probability / 100) * 360;
            const targetAngle = cumulativeAngle + prizeAngle / 2;

            // 旋转动画 - 转盘逆时针旋转，让奖项转到顶部指针位置
            const canvas = document.getElementById('wheelCanvas');
            const totalRotation = 360 * 5 + (360 - targetAngle); // 转5圈 + 逆向到目标位置

            canvas.style.transition = 'transform 4s cubic-bezier(0.25, 0.1, 0.25, 1)';
            canvas.style.transform = `rotate(${totalRotation}deg)`;

            // 等待动画完成
            setTimeout(() => {
                showResult(prizeData);
                canvas.style.transition = 'none';
                canvas.style.transform = `rotate(${totalRotation % 360}deg)`;
                isSpinning = false;
                spinButton.textContent = '今日已抽奖';

                // 刷新榜单
                loadRankings();
            }, 4000);
        } else {
            alert(result.message);
            isSpinning = false;
            spinButton.disabled = false;
            spinButton.textContent = '开始转动';
        }
    } catch (error) {
        alert('抽奖失败，请稍后重试');
        isSpinning = false;
        spinButton.disabled = false;
        spinButton.textContent = '开始转动';
    }
}

// 保存到历史记录
function saveToHistory(data) {
    try {
        let history = JSON.parse(localStorage.getItem('cdkHistory') || '[]');

        // 添加新记录
        history.unshift({
            cdk: data.cdk,
            label: data.label,
            times: data.times,
            quota: data.quota,
            timestamp: new Date().toISOString()
        });

        // 只保留最近100条记录
        if (history.length > 100) {
            history = history.slice(0, 100);
        }

        localStorage.setItem('cdkHistory', JSON.stringify(history));
    } catch (error) {
        console.error('保存历史记录失败:', error);
    }
}

// 显示结果
function showResult(data) {
    document.getElementById('resultInfo').innerHTML = `
        <p style="font-size: 28px; color: #4caf50; font-weight: bold;">${data.label}</p>
    `;
    document.getElementById('resultCdk').textContent = `兑换码: ${data.cdk}`;

    // 自动复制兑换码
    copyToClipboard(data.cdk);

    // 保存到历史记录
    saveToHistory(data);

    document.getElementById('resultModal').style.display = 'flex';
}

// 复制到剪贴板
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        // 显示复制成功提示
        showToast('兑换码已自动复制到剪贴板！');
    } catch (error) {
        console.error('复制失败:', error);
        // 尝试降级方案
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('兑换码已自动复制到剪贴板！');
        } catch (e) {
            console.error('降级复制也失败:', e);
        }
    }
}

// 显示提示消息
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 2000);
}

// 显示历史记录
function showHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('cdkHistory') || '[]');

        if (history.length === 0) {
            document.getElementById('historyList').innerHTML = `
                <p style="text-align: center; color: #999; padding: 40px 20px;">暂无历史记录</p>
            `;
        } else {
            document.getElementById('historyList').innerHTML = history.map((item, index) => {
                const date = new Date(item.timestamp);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

                return `
                    <div class="history-item">
                        <div class="history-header">
                            <span class="history-label">${item.label}</span>
                            <span class="history-date">${dateStr}</span>
                        </div>
                        <div class="history-cdk">
                            <span class="cdk-text">${item.cdk}</span>
                            <button class="copy-btn" onclick="copyCdk('${item.cdk}', event)">复制</button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        document.getElementById('historyModal').style.display = 'flex';
    } catch (error) {
        console.error('加载历史记录失败:', error);
        alert('加载历史记录失败');
    }
}

// 复制兑换码（历史记录中）
async function copyCdk(cdk, event) {
    event.stopPropagation();
    try {
        await navigator.clipboard.writeText(cdk);
        showToast('复制成功！');
    } catch (error) {
        // 降级方案
        try {
            const textarea = document.createElement('textarea');
            textarea.value = cdk;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('复制成功！');
        } catch (e) {
            alert('复制失败，请手动复制');
        }
    }
}

// 关闭历史记录弹窗
function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

// 关闭弹窗
function closeModal() {
    document.getElementById('resultModal').style.display = 'none';
}

// 加载榜单
async function loadRankings() {
    try {
        // 今日榜单
        const todayResponse = await fetch('/api/ranking/today');
        const todayResult = await todayResponse.json();

        if (todayResult.success) {
            renderRanking('todayRanking', todayResult.data, 'today');
        }

        // 历史榜单
        const historyResponse = await fetch('/api/ranking/history');
        const historyResult = await historyResponse.json();

        if (historyResult.success) {
            renderRanking('historyRanking', historyResult.data, 'history');
        }
    } catch (error) {
        // 榜单加载失败
    }
}

// 渲染榜单
function renderRanking(elementId, data, type) {
    const container = document.getElementById(elementId);

    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 40px 20px; font-size: 14px;">暂无数据</p>';
        return;
    }

    container.innerHTML = data.map((item, index) => {
        const rank = index + 1;
        const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
        const quota = type === 'today' ? item.today_quota : item.total_quota;
        const times = (quota / 500).toFixed(0);

        return `
            <div class="ranking-item">
                <div class="ranking-number ${rankClass}">${rank}</div>
                <img src="${item.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + item.username}" 
                     alt="Avatar" class="ranking-avatar">
                <div class="ranking-info">
                    <div class="ranking-name">${item.username}</div>
                    <div class="ranking-quota">${times} 次</div>
                </div>
            </div>
        `;
    }).join('');
}

