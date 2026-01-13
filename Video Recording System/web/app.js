// 视频录制系统多页面应用
class VideoRecorderApp {
    constructor() {
        this.isRecording = false;
        this.startTime = null;
        this.runningTimeInterval = null;
        this.statusUpdateInterval = null;
        this.recordingFilesUpdateInterval = null;
        this.fileManagementUpdateInterval = null;
        this.currentPage = 'dashboard';
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.updateCurrentTime();
        this.loadSystemStatus();
        this.startStatusMonitoring();
        this.addLog("系统初始化完成", 'info');
        
        // 初始化页面导航
        this.initNavigation();
        
        // 初始化时更新文件数量
        this.updateFileCount();
    }
    
    // 初始化导航功能
    initNavigation() {
        // 侧边栏导航点击事件
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.switchPage(page);
                
                // 更新导航样式
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
        
        // 移动端侧边栏切换
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('show');
            });
        }
        
        // 日志级别过滤
        document.querySelectorAll('[data-log-level]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('[data-log-level]').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterLogs(e.target.getAttribute('data-log-level'));
            });
        });
    }
    
    // 切换页面
    switchPage(pageId) {
        // 清理当前页面的监控
        if (this.currentPage === 'files') {
            this.stopFileManagementMonitoring();
        }
        
        // 隐藏所有页面
        document.querySelectorAll('.content-page').forEach(page => {
            page.classList.remove('active');
        });
        
        // 显示目标页面
        const targetPage = document.getElementById(`${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageId;
            
            // 页面切换时的特殊处理
            this.onPageSwitch(pageId);
        }
    }
    
    // 页面切换时的处理
    onPageSwitch(pageId) {
        switch(pageId) {
            case 'files':
                refreshFileManagementList();
                break;
            case 'upload':
                refreshLocalFilesForUpload();
                break;
            case 'recording':
                refreshRecordingFiles();
                refreshAllRecordingFiles();
                break;
            case 'monitor':
                this.updateSystemMonitor();
                break;
            case 'dashboard':
                this.refreshStatus();
                refreshDashboardFiles();
                break;
            case 'config':
                this.loadConfig();
                break;
        }
    }
    
    // 绑定事件监听器
    bindEvents() {
        // 快速操作按钮
        const quickStartBtn = document.getElementById('quickStartBtn');
        const quickStopBtn = document.getElementById('quickStopBtn');
        
        if (quickStartBtn) quickStartBtn.addEventListener('click', () => this.startRecording());
        if (quickStopBtn) quickStopBtn.addEventListener('click', () => this.stopRecording());
        
        // 录制控制页面按钮
        const startBtn = document.getElementById('startRecordingBtn');
        const stopBtn = document.getElementById('stopRecordingBtn');
        
        if (startBtn) startBtn.addEventListener('click', () => this.startRecording());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopRecording());
        
        // 阻止表单默认提交
        const configForm = document.getElementById('configForm');
        if (configForm) {
            configForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.updateConfig();
            });
        }
        
        // 页面可见性变化处理
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // 页面变为可见时，立即检查连接状态
                console.log('页面变为可见，立即检查连接状态');
                this.loadSystemStatus();
            }
        });
    }
    
    // 更新当前时间显示
    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const timeEl = document.getElementById('currentTime');
        if (timeEl) timeEl.textContent = timeString;
        
        setTimeout(() => this.updateCurrentTime(), 1000);
    }
    
    // 加载系统状态
    async loadSystemStatus() {
        try {
            // 设置超时时间为5秒
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch('/api/status', {
                signal: controller.signal,
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const status = await response.json();
            this.updateUI(status);
            this.updateConnectionStatus(true); // 更新连接状态为在线
            
        } catch (error) {
            console.error('加载系统状态失败:', error);
            
            // 区分不同类型的错误
            let errorMessage = error.message;
            if (error.name === 'AbortError') {
                errorMessage = '请求超时';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = '无法连接到服务器';
            } else if (error.message.includes('NetworkError')) {
                errorMessage = '网络错误';
            }
            
            // 强制更新连接状态为离线
            console.log('强制设置连接状态为离线');
            this.addLog(`加载系统状态失败: ${errorMessage}`, 'error');
            this.updateConnectionStatus(false); // 更新连接状态为离线
        }
    }
    
    // 开始状态监控
    startStatusMonitoring() {
        this.statusUpdateInterval = setInterval(() => {
            this.loadSystemStatus();
        }, 2000); // 每2秒更新一次状态
    }
    
    // 开始录制文件监控
    startRecordingFilesMonitoring() {
        if (this.recordingFilesUpdateInterval) {
            clearInterval(this.recordingFilesUpdateInterval);
        }
        
        this.recordingFilesUpdateInterval = setInterval(() => {
            // 只在录制状态时更新录制文件列表
            if (this.isRecording) {
                refreshRecordingFiles(false);
                refreshAllRecordingFiles(false);
                refreshDashboardFiles(false);
                this.updateFileCount(); // 更新文件数量
            }
        }, 2000); // 每2秒更新一次录制文件列表
    }
    
    // 停止录制文件监控
    stopRecordingFilesMonitoring() {
        if (this.recordingFilesUpdateInterval) {
            clearInterval(this.recordingFilesUpdateInterval);
            this.recordingFilesUpdateInterval = null;
        }
    }
    
    // 开始文件管理监控
    startFileManagementMonitoring() {
        // 清除之前的间隔
        if (this.fileManagementUpdateInterval) {
            clearInterval(this.fileManagementUpdateInterval);
        }
        
        // 每3秒刷新一次文件管理列表以更新状态
        this.fileManagementUpdateInterval = setInterval(() => {
            if (this.currentPage === 'files') {
                refreshFileManagementList(false); // 自动刷新时不提示
            }
        }, 3000);
    }
    
    // 停止文件管理监控
    stopFileManagementMonitoring() {
        if (this.fileManagementUpdateInterval) {
            clearInterval(this.fileManagementUpdateInterval);
            this.fileManagementUpdateInterval = null;
        }
    }
    
    // 开始视频预览监控
    startVideoPreviewMonitoring() {
        // 清除之前的间隔
        if (this.videoPreviewUpdateInterval) {
            clearInterval(this.videoPreviewUpdateInterval);
        }
        
        // 每5秒刷新一次视频列表以更新状态
        this.videoPreviewUpdateInterval = setInterval(() => {
            if (this.currentPage === 'preview') {
                refreshVideoList(false); // 自动刷新时不提示
            }
        }, 5000);
    }
    
    // 停止视频预览监控
    stopVideoPreviewMonitoring() {
        if (this.videoPreviewUpdateInterval) {
            clearInterval(this.videoPreviewUpdateInterval);
            this.videoPreviewUpdateInterval = null;
        }
    }
    
    // 更新UI显示
    updateUI(status) {
        // 更新录制状态 - 适配新的API格式
        const isRecording = status.recording1 || status.recording2;
        this.isRecording = isRecording;
        
        // 更新状态值（系统概览页面）
        this.updateElement('recordingStatusValue', isRecording ? '正在录制' : '未录制');
        
        // 更新录制控制页面的状态
        this.updateElement('recordingControlStatus', isRecording ? '正在录制' : '未录制');
        
        // 检查TF卡是否可用（基于剩余空间）
        const tfCardAvailable = status.tfcard && status.tfcard.freeSpace && 
                               !status.tfcard.freeSpace.startsWith('0');
        this.updateElement('tfCardStatusValue', tfCardAvailable ? '可用' : '空间不足');
        
        // 恢复正确的录制模式显示逻辑
        const recordMode = (status.recording1 && status.recording2) ? '双路录制' : 
                          (status.recording1 || status.recording2) ? '单路录制' : '未配置';
        this.updateElement('recordModeValue', recordMode);
        
        // 更新文件数量（从API获取）
        this.updateFileCount();
        
        // 更新存储使用情况（录制控制页面）
        if (status.tfcard && status.tfcard.usagePercent) {
            this.updateElement('recordingControlStorageUsage', status.tfcard.usagePercent);
        }
        
        // 更新TF卡详细信息 - 适配新的API格式
        if (status.tfcard) {
            this.updateElement('tfCardMountPath', status.tfcard.mountPath || '/mnt/tfcard');
            this.updateElement('tfCardTotalSize', status.tfcard.totalSpace || '检查中...');
            this.updateElement('tfCardUsedSize', status.tfcard.usedSpace || '检查中...');
            this.updateElement('tfCardAvailSize', status.tfcard.freeSpace || '检查中...');
            this.updateElement('tfCardUsePercent', status.tfcard.usagePercent || '检查中...');
            this.updateElement('tfCardOverallStatus', tfCardAvailable ? '正常' : '空间不足');
        }
        
        // 更新详细状态（其他页面）
        this.updateElement('recordingDetailStatus', isRecording ? '正在录制' : '未录制');
        
        // 更新按钮状态
        this.updateRecordingButtons(isRecording);
        
        // 更新录制时长 - 使用实际录制时间
        if (isRecording) {
            this.updateRecordingDuration();
            if (!this.durationUpdateInterval) {
                this.startRecordingDurationUpdater();
            }
            this.startRecordingFilesMonitoring(); // 开始录制文件监控
        } else {
            this.updateElement('runningTimeValue', '00:00:00');
            this.updateElement('recordingDuration', '00:00:00');
            this.updateElement('recordingControlDuration', '00:00:00');
            if (this.durationUpdateInterval) {
                clearInterval(this.durationUpdateInterval);
                this.durationUpdateInterval = null;
            }
            this.stopRecordingFilesMonitoring(); // 停止录制文件监控
        }
    }
    
    // 开始录制时长更新器
    startRecordingDurationUpdater() {
        this.durationUpdateInterval = setInterval(() => {
            this.updateRecordingDuration();
        }, 1000);
    }
    
    // 更新录制时长
    async updateRecordingDuration() {
        try {
            const response = await fetch('/api/files');
            const data = await response.json();
            
            if (data.files && Array.isArray(data.files)) {
                // 找到正在录制的文件
                const recordingFiles = data.files.filter(file => file.isRecording);
                
                if (recordingFiles.length > 0) {
                    // 取最新的录制文件（按修改时间排序）
                    const latestFile = recordingFiles.sort((a, b) => b.modifyTime - a.modifyTime)[0];
                    
                    // 从文件名解析录制开始时间 (格式: 2025-06-23_15-23-16.mp4)
                    const timeMatch = latestFile.name.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
                    
                    if (timeMatch) {
                        const dateStr = timeMatch[1]; // 2025-06-23
                        const timeStr = timeMatch[2].replace(/-/g, ':'); // 15:23:16
                        const fileStartTime = new Date(`${dateStr}T${timeStr}`);
                        
                        // 计算当前分段的录制时长
                        const now = new Date();
                        const segmentDuration = now - fileStartTime;
                        
                        if (segmentDuration > 0) {
                            const timeString = this.formatDuration(segmentDuration);
                            this.updateElement('runningTimeValue', timeString);
                            this.updateElement('recordingDuration', timeString);
                            this.updateElement('recordingControlDuration', timeString);
                            return;
                        }
                    }
                    
                    // 备用方法：使用文件的修改时间差来估算
                    const fileModifyTime = new Date(latestFile.modifyTime * 1000);
                    const now = new Date();
                    const timeSinceLastModify = now - fileModifyTime;
                    
                    // 如果文件最近被修改（5秒内），说明正在录制
                    if (timeSinceLastModify < 5000) {
                        // 使用文件名中的时间作为起始时间
                        const nameTimeMatch = latestFile.name.match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
                        if (nameTimeMatch) {
                            const dateStr = nameTimeMatch[1];
                            const timeStr = nameTimeMatch[2].replace(/-/g, ':');
                            const startTime = new Date(`${dateStr}T${timeStr}`);
                            const duration = now - startTime;
                            
                            if (duration > 0) {
                                const timeString = this.formatDuration(duration);
                                this.updateElement('runningTimeValue', timeString);
                                this.updateElement('recordingDuration', timeString);
                                this.updateElement('recordingControlDuration', timeString);
                                return;
                            }
                        }
                    }
                }
            }
            
            // 如果无法获取录制时间，显示00:00:00
            this.updateElement('runningTimeValue', '00:00:00');
            this.updateElement('recordingDuration', '00:00:00');
            this.updateElement('recordingControlDuration', '00:00:00');
            
        } catch (error) {
            console.error('更新录制时长失败:', error);
            // 出错时也显示00:00:00
            this.updateElement('runningTimeValue', '00:00:00');
            this.updateElement('recordingDuration', '00:00:00');
            this.updateElement('recordingControlDuration', '00:00:00');
        }
    }
    
    // 更新录制按钮状态
    updateRecordingButtons(isRecording) {
        const buttons = [
            { id: 'quickStartBtn', disabled: isRecording },
            { id: 'quickStopBtn', disabled: !isRecording },
            { id: 'startRecordingBtn', disabled: isRecording },
            { id: 'stopRecordingBtn', disabled: !isRecording }
        ];
        
        buttons.forEach(btn => {
            const element = document.getElementById(btn.id);
            if (element) {
                element.disabled = btn.disabled;
            }
        });
    }
    
    // 开始运行时间计数器
    startRunningTimeCounter() {
        this.runningTimeInterval = setInterval(() => {
            if (this.startTime) {
                const now = new Date();
                const diff = now - this.startTime;
                const timeString = this.formatDuration(diff);
                this.updateElement('runningTimeValue', timeString);
                this.updateElement('recordingDuration', timeString);
                this.updateElement('recordingControlDuration', timeString); // 同时更新录制控制页面
            }
        }, 1000);
    }
    
    // 格式化时间
    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // 更新元素内容
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = content;
        }
    }
    
    // 更新文件数量
    async updateFileCount() {
        try {
            // 设置超时时间
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            // 使用专门的录制文件API获取更准确的数据
            const response = await fetch('/api/recording-files', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (data.success && Array.isArray(data.files)) {
                const recordingFileCount = data.files.length;
                
                // 更新概览页面的文件数量（显示正在录制的文件数）
                this.updateElement('dashboardRecordingFileCount', recordingFileCount);
                
                // 更新录制控制页面的文件数量（显示正在录制的文件数）
                this.updateElement('recordingStatusFileCount', recordingFileCount);
                this.updateElement('recordingControlFileCount', recordingFileCount);
            } else {
                // 如果API调用失败，使用/api/files获取总文件数
                try {
                    const filesResponse = await fetch('/api/files');
                    const filesData = await filesResponse.json();
                    
                    if (filesData.files && Array.isArray(filesData.files)) {
                        // 过滤正在录制的文件
                        const recordingFiles = filesData.files.filter(file => file.isRecording);
                        const recordingFileCount = recordingFiles.length;
                        
                        this.updateElement('dashboardRecordingFileCount', recordingFileCount);
                        this.updateElement('recordingStatusFileCount', recordingFileCount);
                        this.updateElement('recordingControlFileCount', recordingFileCount);
                    } else {
                        // 显示0
                        this.updateElement('dashboardRecordingFileCount', 0);
                        this.updateElement('recordingStatusFileCount', 0);
                        this.updateElement('recordingControlFileCount', 0);
                    }
                } catch (fallbackError) {
                    console.error('备用API调用也失败:', fallbackError);
                    this.updateElement('dashboardRecordingFileCount', 0);
                    this.updateElement('recordingStatusFileCount', 0);
                    this.updateElement('recordingControlFileCount', 0);
                }
            }
            
            // 单独获取总文件信息用于文件管理页面
            try {
                const totalResponse = await fetch('/api/files');
                const totalData = await totalResponse.json();
                
                if (totalData.files && Array.isArray(totalData.files)) {
                    // 更新文件管理页面的文件数量（显示所有文件）
                    const fileCountBadge = document.getElementById('fileCount');
                    if (fileCountBadge) {
                        fileCountBadge.textContent = `${totalData.files.length} 个文件`;
                    }
                    
                    // 计算总文件大小
                    const totalSize = totalData.files.reduce((sum, file) => sum + (file.size || 0), 0);
                    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
                    const totalSizeBadge = document.getElementById('totalFileSize');
                    if (totalSizeBadge) {
                        totalSizeBadge.textContent = `${totalSizeMB} MB`;
                    }
                }
            } catch (totalError) {
                console.error('获取总文件信息失败:', totalError);
            }
            
        } catch (error) {
            console.error('更新文件数量失败:', error);
            // 出错时，显示0
            this.updateElement('dashboardRecordingFileCount', 0);
            this.updateElement('recordingStatusFileCount', 0);
            this.updateElement('recordingControlFileCount', 0);
        }
    }
    
    // 更新连接状态指示器
    updateConnectionStatus(isOnline) {
        const badge = document.getElementById('connectionBadge');
        const icon = document.getElementById('connectionIcon');
        const status = document.getElementById('connectionStatus');
        
        console.log('更新连接状态:', isOnline ? '在线' : '离线'); // 调试日志
        
        if (badge && icon && status) {
            if (isOnline) {
                badge.className = 'status-badge status-online';
                icon.className = 'bi bi-wifi';
                status.textContent = '系统在线';
            } else {
                badge.className = 'status-badge status-offline';
                icon.className = 'bi bi-wifi-off';
                status.textContent = '系统离线';
            }
        } else {
            console.error('无法找到连接状态元素:', { badge, icon, status });
        }
    }
    
    // 加载配置信息
    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                this.loadConfigToForm(config);
                // 新增：根据配置刷新录制模式显示
                this.updateRecordModeByConfig(config);
            }
        } catch (error) {
            console.error('加载配置失败:', error);
        }
    }
    
    // 新增：根据配置刷新录制模式显示
    updateRecordModeByConfig(config) {
        const recordMode = config.dual_stream_enabled ? '双路录制' : '单路录制';
        this.updateElement('recordModeValue', recordMode);
    }
    
    // 加载配置到表单
    loadConfigToForm(config) {
        const fields = {
            'rtspUrl1': config.rtsp_url1 || '',
            'rtspUrl2': config.rtsp_url2 || '',
            'savePath1': config.save_path1 || '',
            'savePath2': config.save_path2 || '',
            'segmentTime': config.segment_time || 600
        };
        
        Object.entries(fields).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.value = value;
        });
        
        // 双路录制选项（从配置中加载，默认为true）
        const dualStreamEl = document.getElementById('dualStreamEnabled');
        if (dualStreamEl) {
            dualStreamEl.checked = config.dual_stream_enabled !== undefined ? config.dual_stream_enabled : true;
        }
    }
    
    // 开始录制
    async startRecording() {
        if (this.isRecording) {
            this.showModal('提示', '录制已在进行中！');
            return;
        }
        
        this.showLoading('start', true);
        this.addLog("正在启动录制...", 'info');
        
        try {
            // 确保我们有最新的配置
            const configResponse = await fetch('/api/config');
            const config = await configResponse.json();

            const response = await fetch('/api/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // 发送当前配置，让后端知道如何录制
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.addLog("录制启动成功", 'success');
                this.showModal('成功', '录制已成功启动！', 'success');
                
                // 立即强制刷新一次状态
                this.loadSystemStatus();
                
                // 立即刷新文件列表
                setTimeout(() => {
                    refreshDashboardFiles(); // 刷新系统概览文件列表
                    refreshRecordingFiles(); // 刷新正在录制文件列表
                    refreshAllRecordingFiles(); // 刷新录制控制页面的文件列表
                    this.updateFileCount(); // 更新文件数量
                }, 500); // 延迟500ms刷新，等待录制进程启动
                
                // 持续监控录制文件
                this.startRecordingFilesMonitoring();
            } else {
                throw new Error(result.message || '启动录制失败');
            }
            
        } catch (error) {
            console.error('启动录制失败:', error);
            this.addLog(`启动录制失败: ${error.message}`, 'error');
            this.showModal('错误', `启动录制失败: ${error.message}`);
        } finally {
            this.showLoading('start', false);
        }
    }
    
    // 停止录制
    async stopRecording() {
        if (!this.isRecording) {
            this.showModal('提示', '当前没有进行录制！');
            return;
        }
        
        this.showLoading('stop', true);
        this.addLog("正在停止录制...", 'info');
        
        try {
            const response = await fetch('/api/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.addLog("录制停止成功", 'success');
                this.showModal('成功', '录制已成功停止！', 'success');
                
                // 自动刷新相关列表
                setTimeout(() => {
                    this.loadSystemStatus(); // 刷新状态
                    refreshDashboardFiles(); // 刷新系统概览文件列表
                    refreshRecordingFiles(); // 刷新正在录制文件列表
                    refreshAllRecordingFiles(); // 刷新录制控制页面的文件列表
                    this.stopRecordingFilesMonitoring(); // 停止录制文件监控
                }, 200); // 延迟200ms刷新，快速更新状态
                
                // 立即强制刷新一次状态
                this.loadSystemStatus();
            } else {
                throw new Error(result.message || '停止录制失败');
            }
            
        } catch (error) {
            console.error('停止录制失败:', error);
            this.addLog(`停止录制失败: ${error.message}`, 'error');
            this.showModal('错误', `停止录制失败: ${error.message}`);
        } finally {
            this.showLoading('stop', false);
        }
    }
    
    // 更新配置
    async updateConfig() {
        const config = {
            rtsp_url1: document.getElementById('rtspUrl1').value,
            rtsp_url2: document.getElementById('rtspUrl2').value,
            save_path1: document.getElementById('savePath1').value,
            save_path2: document.getElementById('savePath2').value,
            segment_time: parseInt(document.getElementById('segmentTime').value),
            dual_stream_enabled: document.getElementById('dualStreamEnabled').checked
        };
        
        // 基本验证
        if (!config.rtsp_url1) {
            this.showModal('错误', '请输入第一路RTSP地址！');
            return;
        }
        
        if (config.segment_time < 60 || config.segment_time > 3600) {
            this.showModal('错误', '分段时间必须在60-3600秒之间！');
            return;
        }
        
        this.addLog("正在更新配置...", 'info');
        
        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.addLog("配置更新成功", 'success');
                this.showModal('成功', '配置已成功更新！', 'success');
                this.loadSystemStatus(); // 重新加载状态
                // 新增：配置变更后刷新录制模式
                this.updateRecordModeByConfig(config);
            } else {
                throw new Error(result.message || '更新配置失败');
            }
            
        } catch (error) {
            console.error('更新配置失败:', error);
            this.addLog(`更新配置失败: ${error.message}`, 'error');
            this.showModal('错误', `更新配置失败: ${error.message}`);
        }
    }
    
    // 重置配置
    resetConfig() {
        if (confirm('确定要重置配置到默认值吗？')) {
            document.getElementById('rtspUrl1').value = 'rtsp://192.168.1.63:554/media/video1';
            document.getElementById('rtspUrl2').value = 'rtsp://192.168.1.63:554/media/video2';
            document.getElementById('savePath1').value = '/mnt/tfcard/videos1';
            document.getElementById('savePath2').value = '/mnt/tfcard/videos2';
            document.getElementById('segmentTime').value = 600;
            document.getElementById('dualStreamEnabled').checked = true;
            
            this.addLog("配置已重置到默认值", 'info');
        }
    }
    
    // 刷新文件列表
    async refreshFileList() {
        this.addLog("正在刷新文件列表...", 'info');
        
        try {
            const response = await fetch('/api/files');
            const result = await response.json();
            const files = result.files || [];
            
            const container = document.getElementById('fileListContainer');
            const countEl = document.getElementById('fileCount');
            
            if (!container) return;
            
            if (files.length === 0) {
                container.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-folder-x" style="font-size: 3rem;"></i>
                        <p class="mt-2">暂无录制文件</p>
                    </div>
                `;
                if (countEl) countEl.textContent = '0 个文件';
            } else {
                const fileItems = files.map((file, index) => `
                    <div class="d-flex justify-content-between align-items-center py-2 px-2 ${index % 2 === 0 ? 'bg-light' : ''}">
                        <div class="d-flex align-items-center">
                            <i class="bi bi-file-earmark-play text-primary me-2"></i>
                            <small class="text-muted">${file}</small>
                        </div>
                        <span class="badge bg-secondary">MP4</span>
                    </div>
                `).join('');
                
                container.innerHTML = fileItems;
                if (countEl) countEl.textContent = `${files.length} 个文件`;
            }
            
            this.addLog(`文件列表刷新完成，共 ${files.length} 个文件`, 'success');
            
        } catch (error) {
            console.error('刷新文件列表失败:', error);
            this.addLog(`刷新文件列表失败: ${error.message}`, 'error');
        }
    }
    
    // 更新系统监控信息
    async updateSystemMonitor() {
        try {
            const response = await fetch('/api/system-monitor');
            const data = await response.json();
            
            if (data.success) {
                // 更新CPU使用率
                const cpuUsage = Math.round(data.cpu_usage || 0);
                document.getElementById('cpuUsageBar').style.width = `${cpuUsage}%`;
                document.getElementById('cpuUsageBar').textContent = `${cpuUsage}%`;
                document.getElementById('cpuUsageText').textContent = `${cpuUsage}%`;
                
                // 更新内存使用率
                const memUsage = Math.round(data.memory_usage || 0);
                document.getElementById('memoryUsageBar').style.width = `${memUsage}%`;
                document.getElementById('memoryUsageBar').textContent = `${memUsage}%`;
                document.getElementById('memoryUsageText').textContent = `${memUsage}%`;
                
                // 更新磁盘使用率
                const diskUsage = Math.round(data.disk_usage || 0);
                document.getElementById('diskUsageBar').style.width = `${diskUsage}%`;
                document.getElementById('diskUsageBar').textContent = `${diskUsage}%`;
                document.getElementById('diskUsageText').textContent = `${diskUsage}%`;
                
                // 更新磁盘进度条颜色
                const diskBar = document.getElementById('diskUsageBar');
                diskBar.className = 'progress-bar';
                if (diskUsage > 90) {
                    diskBar.classList.add('bg-danger');
                } else if (diskUsage > 70) {
                    diskBar.classList.add('bg-warning');
                } else {
                    diskBar.classList.add('bg-success');
                }
                
                // 更新网络统计
                const rxBytes = data.network_rx || 0;
                const txBytes = data.network_tx || 0;
                document.getElementById('networkRx').textContent = `↓ ${this.formatBytes(rxBytes)}`;
                document.getElementById('networkTx').textContent = `↑ ${this.formatBytes(txBytes)}`;
                
                // 更新系统负载
                const loadAvg = (data.load_average || 0).toFixed(2);
                document.getElementById('loadAverage').textContent = loadAvg;
                
                // 更新系统运行时间
                document.getElementById('systemUptime').textContent = data.uptime || '未知';
                
                // 更新系统温度
                const temp = data.temperature || 0;
                const tempEl = document.getElementById('systemTemperature');
                tempEl.textContent = temp > 0 ? `${temp.toFixed(1)}°C` : '未检测到';
                
                // 根据温度设置颜色
                tempEl.className = 'h2';
                if (temp > 70) {
                    tempEl.classList.add('text-danger');
                } else if (temp > 60) {
                    tempEl.classList.add('text-warning');
                } else {
                    tempEl.classList.add('text-success');
                }
                
                this.addLog("系统监控数据已更新", 'info');
            } else {
                this.addLog(`获取系统监控数据失败: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('获取系统监控数据失败:', error);
            this.addLog(`获取系统监控数据失败: ${error.message}`, 'error');
        }
    }
    
    // 格式化字节数
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 显示/隐藏加载动画
    showLoading(type, show) {
        const spinnerId = type === 'start' ? 'startSpinner' : 'stopSpinner';
        const spinner = document.getElementById(spinnerId);
        if (spinner) {
            spinner.style.display = show ? 'inline-block' : 'none';
        }
        
        // 通用加载动画
        const generalSpinner = document.getElementById('loadingSpinner');
        if (generalSpinner) {
            generalSpinner.style.display = show ? 'inline-block' : 'none';
        }
    }
    
    // 显示精美悬浮提示
    showToast(title, message, type = 'info', duration = 3000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        
        const toastId = 'toast-' + Date.now();
        
        // 确定图标和类型
        let iconSymbol = '✓';
        let toastClass = 'toast-info';
        switch(type) {
            case 'success':
                iconSymbol = '✓';
                toastClass = 'toast-success';
                break;
            case 'error':
                iconSymbol = '✕';
                toastClass = 'toast-error';
                break;
            case 'warning':
                iconSymbol = '⚠';
                toastClass = 'toast-warning';
                break;
            default:
                iconSymbol = 'ℹ';
                toastClass = 'toast-info';
        }
        
        // 创建Toast HTML
        const toastHtml = `
            <div class="toast-custom ${toastClass}" id="${toastId}">
                <div class="toast-content">
                    <div class="toast-icon">${iconSymbol}</div>
                    <div class="toast-message">
                        <div class="toast-title">${title}</div>
                        <div class="toast-text">${message}</div>
                    </div>
                </div>
                <div class="toast-progress"></div>
            </div>
        `;
        
        // 添加到容器
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastElement = document.getElementById(toastId);
        
        // 显示动画
        setTimeout(() => {
            toastElement.classList.add('show');
        }, 50);
        
        // 自动隐藏 - 3秒后从左向右消失
        setTimeout(() => {
            toastElement.classList.add('hide');
            setTimeout(() => {
                if (toastElement.parentNode) {
                    toastElement.remove();
                }
            }, 500);
        }, duration);
    }

    // 兼容旧的showModal方法
    showModal(title, message, type = 'info') {
        this.showToast(title, message, type);
    }
    
    // 添加系统日志
    addLog(message, type = 'info') {
        const logEl = document.getElementById('systemLog');
        if (!logEl) return;
        
        const now = new Date().toLocaleTimeString('zh-CN');
        const colorClass = {
            'success': 'log-success',
            'error': 'log-error', 
            'warning': 'log-warning',
            'info': 'log-info'
        }[type] || 'log-info';
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${colorClass}`;
        logEntry.innerHTML = `
            <span class="log-time">[${now}]</span>
            <span class="${colorClass}">${message}</span>
        `;
        
        logEl.appendChild(logEntry);
        logEl.scrollTop = logEl.scrollHeight;
        
        // 限制日志条数
        const logs = logEl.children;
        if (logs.length > 200) {
            logEl.removeChild(logs[0]);
        }
    }
    
    // 过滤日志
    filterLogs(level) {
        const logEl = document.getElementById('systemLog');
        if (!logEl) return;
        
        const entries = logEl.querySelectorAll('.log-entry');
        entries.forEach(entry => {
            if (level === 'all') {
                entry.style.display = 'block';
            } else {
                const hasClass = entry.classList.contains(`log-${level}`);
                entry.style.display = hasClass ? 'block' : 'none';
            }
        });
    }
    
    // 清空日志
    clearLogs() {
        if (confirm('确定要清空所有日志吗？')) {
            const logEl = document.getElementById('systemLog');
            if (logEl) {
                logEl.innerHTML = `
                    <div class="log-entry">
                        <span class="log-time">[${new Date().toLocaleTimeString('zh-CN')}]</span>
                        <span class="log-info">日志已清空</span>
                    </div>
                `;
            }
        }
    }
    
    // 刷新状态
    refreshStatus() {
        this.loadSystemStatus();
        this.addLog("状态已刷新", 'info');
    }
}

// 全局函数，供HTML调用
function updateConfig() {
    if (window.app) {
        window.app.updateConfig();
    }
}

function resetConfig() {
    if (window.app) {
        window.app.resetConfig();
    }
}

function refreshFileList() {
    if (window.app) {
        window.app.refreshFileList();
    }
}

function refreshStatus() {
    if (window.app) {
        window.app.refreshStatus();
    }
}

function clearLogs() {
    if (window.app) {
        window.app.clearLogs();
    }
}

function refreshSystemMonitor() {
    if (window.app) {
        window.app.updateSystemMonitor();
    }
}

// =================================================================================
// Global Functions & Helper
// =================================================================================

function createFileTableRow(file, showCheckbox = false) {
    const row = document.createElement('tr');
    
    const fileName = file.name || '未知文件名';
    const channel = file.channel || '未知';
    const sizeStr = file.sizeStr || '0 B';
    const timeStr = file.timeStr || '未知时间';
    const isRecording = file.isRecording || false;
    const filePath = file.fullPath || '';
    const relativePath = file.relativePath || '';

    const statusBadge = isRecording ? 
        '<span class="badge bg-danger"><i class="bi bi-record-fill"></i> 录制中</span>' :
        '<span class="badge bg-success">已完成</span>';
    
    const channelBadge = channel === 'videos1' ? 
        '<span class="badge bg-primary">通道1</span>' :
        '<span class="badge bg-info">通道2</span>';
    
    const checkboxCell = showCheckbox ? 
        `<td><input type="checkbox" class="form-check-input file-checkbox" 
                      data-filepath="${filePath}" 
                      data-filename="${fileName}" 
                      data-relativepath="${relativePath}"
                      ${isRecording ? 'disabled' : ''}></td>` : '<td></td>';
    
    row.innerHTML = `
        ${checkboxCell}
        <td><i class="bi bi-file-earmark-play text-primary me-2"></i>${fileName}</td>
        <td>${channelBadge}</td>
        <td>${sizeStr}</td>
        <td>${timeStr}</td>
        <td>${statusBadge}</td>
        <td>
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="downloadFile('${relativePath}')" title="下载文件">
                    <i class="bi bi-download"></i>
                </button>
                <button class="btn btn-outline-danger" onclick="deleteSingleFile('${filePath}', '${fileName}')" 
                        ${isRecording ? 'disabled title="无法删除正在录制的文件"' : 'title="删除文件"'}>
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </td>
    `;
    
    return row;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 下载文件
async function downloadFile(relativePath) {
    try {
        // 显示加载提示
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('开始下载', '正在准备下载文件...', 'info', 2000);
        }
        
        const url = `/api/preview/${encodeURIComponent(relativePath)}?download=1`;
        const a = document.createElement('a');
        a.href = url;
        a.download = relativePath.split('/').pop(); // 获取文件名
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 显示成功提示
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('下载成功', `文件 ${a.download} 已开始下载`, 'success', 3000);
        }
        
    } catch (error) {
        console.error('下载文件失败:', error);
        
        // 显示错误提示
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('下载失败', error.message || '下载文件时发生错误', 'error', 4000);
        }
    }
}

// 删除文件
async function deleteFile(filePath, fileName, showConfirm = true) {
    try {
        // 确认删除
        if (showConfirm) {
            const confirmed = confirm(`确定要删除文件 "${fileName}" 吗？此操作不可撤销。`);
            if (!confirmed) {
                return;
            }
        }
        
        // 显示加载提示
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('正在删除', `正在删除文件 ${fileName}...`, 'info', 2000);
        }
        
        const response = await fetch('/api/delete-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filePath: filePath })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // 显示成功提示
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('删除成功', `文件 ${fileName} 已成功删除`, 'success', 3000);
            }
            
            // 刷新相关列表
            if (typeof refreshFileManagementList === 'function') {
                refreshFileManagementList();
            }
            if (typeof refreshAllRecordingFiles === 'function') {
                refreshAllRecordingFiles();
            }
            if (typeof refreshDashboardFiles === 'function') {
                refreshDashboardFiles();
            }
        } else {
            throw new Error(result.message || '删除文件失败');
        }
        
    } catch (error) {
        console.error('删除文件失败:', error);
        
        // 显示错误提示
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('删除失败', error.message || '删除文件时发生错误', 'error', 4000);
        }
    }
}

// =================================================================================
// Page-specific Functions
// =================================================================================

// --- File Management Page ---
function initFileManagementPage() {
    document.getElementById('select-all-files')?.addEventListener('change', (e) => {
        document.querySelectorAll('#file-management-list-body .file-checkbox').forEach(checkbox => {
            if (!checkbox.disabled) checkbox.checked = e.target.checked;
        });
        updateSelectedFileCountAndButtons();
    });

    document.getElementById('file-management-list-body')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            updateSelectedFileCountAndButtons();
        }
    });

    document.querySelectorAll('input[name="fileFilter"]').forEach(radio => {
        radio.addEventListener('change', () => filterFileManagementList());
    });

    document.getElementById('apply-file-date-filter')?.addEventListener('click', () => filterFileManagementList());
    document.getElementById('clear-file-date-filter')?.addEventListener('click', () => {
        document.getElementById('file-start-date').value = '';
        document.getElementById('file-end-date').value = '';
        filterFileManagementList();
    });
     document.getElementById('today-file-filter')?.addEventListener('click', () => {
        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('file-start-date').value = today;
        document.getElementById('file-end-date').value = today;
        filterFileManagementList();
    });
}

async function refreshFileManagementList(showToast = true) {
    const tbody = document.getElementById('file-management-list-body');
    const button = document.querySelector('button[onclick="refreshFileManagementList()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span> 刷新中...';
    }
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3"><div class="spinner-border spinner-border-sm me-2"></div>正在刷新文件列表...</td></tr>';
    
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        
        if (data.files && Array.isArray(data.files)) {
            tbody.innerHTML = '';
            
            if (data.files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3 text-muted">没有找到录制文件</td></tr>';
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新完成', '没有找到录制文件', 'info', 2000);
                }
            } else {
                // 按时间倒序排列
                data.files.sort((a, b) => new Date(b.timeStr) - new Date(a.timeStr)).forEach(file => {
                    const row = createFileTableRow(file, true);
                    tbody.appendChild(row);
                });
                
                // 更新文件统计
                updateSelectedFileCountAndButtons();
                
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新成功', `已加载 ${data.files.length} 个文件`, 'success', 2000);
                }
            }
        } else {
            throw new Error('无效的响应数据格式');
        }
    } catch (error) {
        console.error('刷新文件管理列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger p-3">加载失败，请重试</td></tr>';
        
        if (showToast && window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('刷新失败', '无法加载文件列表，请重试', 'error', 3000);
        }
    } finally {
        // 恢复按钮状态
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新列表';
        }
    }
}

function filterFileManagementList() {
    const tbody = document.getElementById('file-management-list-body');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0 || (rows.length === 1 && rows[0].firstElementChild.colSpan === 7)) {
        updateSelectedFileCountAndButtons();
        return;
    }

    const channelFilter = document.querySelector('input[name="fileFilter"]:checked').id;
    const startDate = document.getElementById('file-start-date').value;
    const endDate = document.getElementById('file-end-date').value;

    // 显示筛选提示
    if (window.app && typeof window.app.showToast === 'function') {
        let filterInfo = [];
        if (channelFilter === 'filterChannel1') filterInfo.push('通道: 通道1');
        else if (channelFilter === 'filterChannel2') filterInfo.push('通道: 通道2');
        
        if (startDate || endDate) {
            let dateInfo = '日期: ';
            if (startDate && endDate) {
                dateInfo += `${startDate} 至 ${endDate}`;
            } else if (startDate) {
                dateInfo += `≥${startDate}`;
            } else {
                dateInfo += `≤${endDate}`;
            }
            filterInfo.push(dateInfo);
        }
        
        if (filterInfo.length > 0) {
            window.app.showToast('筛选已应用', filterInfo.join(', '), 'info', 3000);
        } else {
            window.app.showToast('筛选已清除', '显示所有文件', 'info', 2000);
        }
    }

    let visibleCount = 0;
    rows.forEach(row => {
        const channelBadge = row.cells[2]?.querySelector('.badge');
        const timeStr = row.cells[4]?.textContent;
        if (!channelBadge || !timeStr) return;

        let showByChannel = (channelFilter === 'filterAll') ||
                            (channelFilter === 'filterChannel1' && channelBadge.textContent.includes('通道1')) ||
                            (channelFilter === 'filterChannel2' && channelBadge.textContent.includes('通道2'));

        let showByDate = true;
        const fileDate = timeStr.split(' ')[0];
        if (startDate && fileDate < startDate) showByDate = false;
        if (endDate && fileDate > endDate) showByDate = false;
        
        const shouldShow = showByChannel && showByDate;
        row.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });

    updateSelectedFileCountAndButtons();
    
    // 显示筛选结果提示
    setTimeout(() => {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('筛选完成', `找到 ${visibleCount} 个匹配的文件`, 'success', 2000);
        }
    }, 200);
}

function updateSelectedFileCountAndButtons() {
    const allCheckboxes = document.querySelectorAll('#file-management-list-body .file-checkbox');
    const checkedCheckboxes = document.querySelectorAll('#file-management-list-body .file-checkbox:checked');
    const selectAllCheckbox = document.getElementById('select-all-files');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const downloadBtn = document.getElementById('downloadSelectedBtn');
    const counter = document.getElementById('selected-files-count');

    if (deleteBtn) deleteBtn.disabled = checkedCheckboxes.length === 0;
    if (downloadBtn) downloadBtn.disabled = checkedCheckboxes.length === 0;
    if (counter) counter.textContent = `已选择 ${checkedCheckboxes.length} / ${allCheckboxes.length}`;

    if (selectAllCheckbox) {
        const availableCheckboxes = Array.from(allCheckboxes).filter(cb => !cb.disabled);
        if (availableCheckboxes.length > 0 && checkedCheckboxes.length === availableCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

async function deleteSingleFile(filePath, fileName) {
    if (await deleteFile(filePath, fileName, true)) {
        refreshFileManagementList();
    }
}

async function deleteSelectedFiles() {
    const checkboxes = document.querySelectorAll('#file-management-list-body .file-checkbox:checked');
    const button = document.getElementById('deleteSelectedBtn');
    
    if (checkboxes.length === 0) {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('请选择文件', '请先选择要删除的文件', 'warning', 3000);
        } else {
            alert('请选择要删除的文件');
        }
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${checkboxes.length} 个文件吗？此操作不可撤销！`)) {
        return;
    }
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-trash"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span> 删除中...';
    }
    
    if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('开始删除', `正在删除 ${checkboxes.length} 个文件...`, 'info', 2000);
    }
    
    let successCount = 0;
    for (const cb of checkboxes) {
        if (await deleteFile(cb.dataset.filepath, cb.dataset.filename, false)) {
            successCount++;
        }
    }
    
    const errorCount = checkboxes.length - successCount;
    
    // 显示结果提示
    if (errorCount === 0) {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('删除成功', `成功删除 ${successCount} 个文件`, 'success', 3000);
        } else {
            alert(`删除成功: ${successCount} 个文件`);
        }
    } else {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('部分删除失败', `成功删除 ${successCount} 个文件，失败 ${errorCount} 个`, 'warning', 4000);
        } else {
            alert(`删除操作完成: 成功 ${successCount} 个, 失败 ${errorCount} 个。`);
        }
    }
    
    // 恢复按钮状态
    if (button) {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-trash"></i> 删除选中';
    }
    
    refreshFileManagementList();
}

function downloadSelectedFiles() {
    const checkboxes = document.querySelectorAll('#file-management-list-body .file-checkbox:checked');
    const button = document.getElementById('downloadSelectedBtn');
    
    if (checkboxes.length === 0) {
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('请选择文件', '请先选择要下载的文件', 'warning', 3000);
        } else {
            alert('请选择要下载的文件');
        }
        return;
    }
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-download"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span> 下载中...';
    }
    
    if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('开始下载', `正在下载 ${checkboxes.length} 个文件...`, 'info', 2000);
    }
    
    // 批量下载文件
    checkboxes.forEach(cb => downloadFile(cb.dataset.relativepath));
    
    // 延迟恢复按钮状态，给下载一些时间开始
    setTimeout(() => {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-download"></i> 下载选中';
        }
        
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('下载开始', `${checkboxes.length} 个文件下载已开始`, 'success', 3000);
        }
    }, 1000);
}


// --- File Upload Page ---
function initUploadPage() {
    document.getElementById('selectAllUpload')?.addEventListener('change', (e) => {
        document.querySelectorAll('#upload-file-list-body .file-checkbox').forEach(checkbox => {
            if (!checkbox.disabled) checkbox.checked = e.target.checked;
        });
        updateUploadButtonStatus();
    });

    document.getElementById('upload-file-list-body')?.addEventListener('change', (e) => {
        if (e.target.classList.contains('file-checkbox')) {
            updateUploadButtonStatus();
        }
    });

    document.getElementById('uploadSelectedFilesBtn')?.addEventListener('click', uploadSelectedFilesToS3);
}

async function refreshLocalFilesForUpload() {
    const tbody = document.getElementById('upload-file-list-body');
    const button = document.querySelector('button[onclick="refreshLocalFilesForUpload()"]');
    
    if (!tbody) return;
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span> 刷新中...';
    }
    
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm"></div> 正在刷新文件列表...</td></tr>';
    
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        if (!data.success || !Array.isArray(data.files)) throw new Error(data.message || '返回数据格式不正确');
        
        tbody.innerHTML = '';
        if (data.files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">没有找到录制文件</td></tr>';
            
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新完成', '没有找到录制文件', 'info', 2000);
            }
        } else {
            data.files.sort((a, b) => new Date(b.timeStr) - new Date(a.timeStr)).forEach(file => {
                // Use the same row creation function, but the table structure is simpler on this page
                // The last '操作' column is not present.
                const row = createFileTableRow(file, true);
                row.removeChild(row.lastElementChild); // Remove action buttons column
                tbody.appendChild(row);
            });
            
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新成功', `已加载 ${data.files.length} 个文件`, 'success', 2000);
            }
        }
    } catch (error) {
        console.error('刷新上传文件列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-5">无法加载文件列表: ${error.message}</td></tr>`;
        
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('刷新失败', '无法加载文件列表，请重试', 'error', 3000);
        }
    } finally {
        updateUploadButtonStatus();
        
        // 恢复按钮状态
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新文件';
        }
    }
}

function updateUploadButtonStatus() {
    const checkedCheckboxes = document.querySelectorAll('#upload-file-list-body .file-checkbox:checked');
    const uploadBtn = document.getElementById('uploadSelectedFilesBtn');
    const counter = document.getElementById('upload-selection-counter');
    const selectAllCheckbox = document.getElementById('selectAllUpload');

    if (uploadBtn) uploadBtn.disabled = checkedCheckboxes.length === 0;
    if (counter) counter.textContent = `已选择 ${checkedCheckboxes.length} 个文件`;

    if (selectAllCheckbox) {
        const allCheckboxes = document.querySelectorAll('#upload-file-list-body .file-checkbox');
        const available = Array.from(allCheckboxes).filter(cb => !cb.disabled);
        if (available.length > 0 && checkedCheckboxes.length === available.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (checkedCheckboxes.length > 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

async function uploadSelectedFilesToS3() {
    const checkboxes = document.querySelectorAll('#upload-file-list-body .file-checkbox:checked');
    if (checkboxes.length === 0 || !confirm(`您确定要上传选中的 ${checkboxes.length} 个文件到 S3 吗？`)) return;

    const uploadBtn = document.getElementById('uploadSelectedFilesBtn');
    if (uploadBtn) uploadBtn.disabled = true;
    if (window.app) window.app.addLog(`开始上传 ${checkboxes.length} 个文件...`, 'info');

    let successCount = 0;
    const errors = [];

    for (const cb of checkboxes) {
        try {
            const response = await fetch('/api/upload-to-s3', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: cb.dataset.filepath, fileName: cb.dataset.filename })
            });
            const result = await response.json();
            if (response.ok && result.success) {
                successCount++;
                if (window.app) window.app.addLog(`文件 ${cb.dataset.filename} 上传成功。`, 'success');
            } else {
                throw new Error(result.message || '未知错误');
            }
        } catch (err) {
            errors.push(`<li>${cb.dataset.filename}: ${err.message}</li>`);
            if (window.app) window.app.addLog(`上传文件 ${cb.dataset.filename} 失败: ${err.message}`, 'error');
        }
    }

    if (uploadBtn) uploadBtn.disabled = false;

    let message = `上传操作完成。<br>成功: ${successCount} 个<br>失败: ${errors.length} 个`;
    if (errors.length > 0) {
        message += `<br><br><b>失败详情:</b><ul>${errors.join('')}</ul>`;
        if (window.app) window.app.showModal('上传结果', message, 'error');
    } else {
        if (window.app) window.app.showModal('上传成功', message, 'success');
    }

    refreshLocalFilesForUpload();
}


// =================================================================================
// App Initialization
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VideoRecorderApp();
    
    // Initialize all pages
    initFileManagementPage();
    initUploadPage();
    // initVideoPreviewPage(); // etc. for other pages
});

// =================================================================================
// Missing Recording Files Functions
// =================================================================================

// =================================================================================

// 创建录制文件行（卡片式）
function createRecordingFileRow(file) {
    const isRecording = file.isRecording;
    const statusClass = isRecording ? 'file-status-recording' : 'file-status-completed';
    const statusText = isRecording ? '录制中' : '已完成';
    const channelText = file.channel === 'videos1' ? '通道1' : '通道2';
    
    return `
        <div class="file-card-compact">
            <div class="file-card-header">
                <h6 class="file-card-title">${file.name}</h6>
                <span class="file-card-channel">${channelText}</span>
            </div>
            <div class="file-card-details">
                <span class="file-card-size">${file.sizeStr}</span>
                <span class="file-card-time">${file.timeStr}</span>
            </div>
            <div class="file-card-status">
                <span class="file-status-badge ${statusClass}">${statusText}</span>
            </div>
        </div>
    `;
}

// 创建所有录制文件行（卡片式）
function createAllRecordingFileRow(file) {
    const isRecording = file.isRecording;
    const statusClass = isRecording ? 'file-status-recording' : 'file-status-completed';
    const statusText = isRecording ? '录制中' : '已完成';
    const channelText = file.channel === 'videos1' ? '通道1' : '通道2';
    
    return `
        <div class="file-card-compact">
            <div class="file-card-header">
                <h6 class="file-card-title">${file.name}</h6>
                <span class="file-card-channel">${channelText}</span>
            </div>
            <div class="file-card-details">
                <span class="file-card-size">${file.sizeStr}</span>
                <span class="file-card-time">${file.timeStr}</span>
            </div>
            <div class="file-card-status">
                <span class="file-status-badge ${statusClass}">${statusText}</span>
                <div class="file-card-actions">
                    <button class="btn btn-outline-primary btn-sm" onclick="downloadFile('${file.relativePath}')">
                        <i class="bi bi-download"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteFile('${file.fullPath}', '${file.name}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 刷新预览视频列表
function refreshVideoList(showToast = true) {
    const container = document.getElementById('videoFilesList');
    const button = document.querySelector('button[onclick="refreshVideoList()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span>';
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-center align-items-center py-5">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span>正在刷新视频列表...</span>
        </div>
    `;
    
    fetch('/api/files')
        .then(response => response.json())
        .then(data => {
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                // 过滤视频文件并按时间倒序排列
                const videoFiles = data.files
                    .filter(file => file.name && (file.name.endsWith('.mp4') || file.name.endsWith('.avi')))
                    .sort((a, b) => new Date(b.timeStr) - new Date(a.timeStr));
                
                if (videoFiles.length > 0) {
                    container.innerHTML = videoFiles.map(file => createVideoListItem(file)).join('');
                    
                    if (showToast && window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('刷新成功', `找到 ${videoFiles.length} 个视频文件`, 'success', 2000);
                    }
                } else {
                    container.innerHTML = `
                        <div class="d-flex flex-column justify-content-center align-items-center py-5 text-muted">
                            <i class="bi bi-camera-video fs-1 mb-3"></i>
                            <p class="mb-0">暂无视频文件</p>
                        </div>
                    `;
                    
                    if (showToast && window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('刷新完成', '暂无视频文件', 'info', 2000);
                    }
                }
            } else {
                container.innerHTML = `
                    <div class="d-flex flex-column justify-content-center align-items-center py-5 text-muted">
                        <i class="bi bi-camera-video fs-1 mb-3"></i>
                        <p class="mb-0">暂无视频文件</p>
                    </div>
                `;
                
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新完成', '暂无视频文件', 'info', 2000);
                }
            }
        })
        .catch(error => {
            console.error('刷新视频列表失败:', error);
            container.innerHTML = `
                <div class="d-flex flex-column justify-content-center align-items-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle fs-1 mb-3"></i>
                    <p class="mb-0">加载失败，请重试</p>
                </div>
            `;
            
            if (showToast && window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新失败', '无法获取视频列表，请重试', 'error', 3000);
            }
        })
        .finally(() => {
            // 恢复按钮状态
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            }
        });
}

// 创建视频预览卡片（用于其他地方）
function createVideoPreviewCard(file) {
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4 mb-3';
    
    card.innerHTML = `
        <div class="card">
            <div class="card-body">
                <h6 class="card-title">
                    <span class="badge bg-${file.channel === 'videos1' ? 'primary' : 'success'} me-2">${file.channel === 'videos1' ? '通道1' : '通道2'}</span>
                    ${file.name}
                </h6>
                <p class="card-text">
                    <small class="text-muted">
                        <i class="bi bi-calendar me-1"></i>${file.timeStr}<br>
                        <i class="bi bi-file-earmark me-1"></i>${file.sizeStr}
                    </small>
                </p>
                <div class="btn-group btn-group-sm w-100">
                    <button class="btn btn-outline-primary" onclick="playVideo('${file.relativePath}', '${file.name}')">
                        <i class="bi bi-play me-1"></i>播放
                    </button>
                    <button class="btn btn-outline-secondary" onclick="downloadFile('${file.relativePath}')">
                        <i class="bi bi-download me-1"></i>下载
                    </button>
                </div>
            </div>
        </div>
    `;
    
    return card;
}

// 创建视频列表项（用于视频预览页面的文件列表）
function createVideoListItem(file) {
    // 美化的状态徽章
    const statusInfo = file.isRecording ? 
        { icon: 'bi-record-circle-fill', class: 'video-status-recording', text: '录制中' } :
        { icon: 'bi-check-circle-fill', class: 'video-status-completed', text: '已完成' };
    
    // 美化的通道徽章
    const channelInfo = file.channel === 'videos1' ? 
        { class: 'video-channel-1', text: '通道1' } :
        { class: 'video-channel-2', text: '通道2' };
    
    return `
        <div class="list-group-item list-group-item-action video-file-item" 
             data-filepath="${file.fullPath}" 
             data-relativepath="${file.relativePath}" 
             data-filename="${file.name}">
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1" onclick="playVideoFromList('${file.relativePath}', '${file.name}')">
                    <div class="video-item-header mb-2">
                        <span class="video-channel-badge ${channelInfo.class}">${channelInfo.text}</span>
                        <span class="video-status-badge ${statusInfo.class}">
                            <i class="${statusInfo.icon}"></i>
                            ${statusInfo.text}
                        </span>
                    </div>
                    <h6 class="video-item-title mb-1">${file.name}</h6>
                    <div class="video-item-meta">
                        <span class="meta-item">
                            <i class="bi bi-calendar3"></i>
                            ${file.timeStr}
                        </span>
                        <span class="meta-item">
                            <i class="bi bi-file-earmark-binary"></i>
                            ${file.sizeStr}
                        </span>
                    </div>
                </div>
                <div class="video-item-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="playVideoFromList('${file.relativePath}', '${file.name}')" title="播放视频">
                        <i class="bi bi-play-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="downloadFile('${file.relativePath}')" title="下载文件">
                        <i class="bi bi-download"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 播放视频
function playVideo(relativePath, fileName) {
    const modal = document.getElementById('videoPreviewModal');
    const video = document.getElementById('previewVideo');
    const title = document.getElementById('videoPreviewTitle');
    
    if (modal && video && title) {
        title.textContent = fileName;
        video.src = `/api/preview/${relativePath}`;
        video.load();
        
        // 使用Bootstrap模态框
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    }
}

// 从列表播放视频
function playVideoFromList(relativePath, fileName) {
    const videoPlayer = document.getElementById('videoPlayer');
    const currentVideoName = document.getElementById('currentVideoName');
    const downloadBtn = document.getElementById('downloadVideoBtn');
    
    if (videoPlayer) {
        // 显示加载覆盖层
        const loadingOverlay = document.getElementById('videoLoadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
        
        videoPlayer.src = `/api/preview/${relativePath}`;
        videoPlayer.load();
        
        // 更新当前视频名称
        if (currentVideoName) {
            currentVideoName.textContent = fileName;
        }
        
        // 启用下载按钮
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.setAttribute('onclick', `downloadFile('${relativePath}')`);
        }
        
        // 添加事件监听器
        videoPlayer.onloadstart = () => {
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
        };
        
        videoPlayer.oncanplay = () => {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        };
        
        videoPlayer.onerror = () => {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            alert('视频加载失败，请检查文件是否存在或网络连接。');
        };
        
        // 高亮当前选中的视频
        document.querySelectorAll('.video-file-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // 找到并高亮当前项
        const currentItem = Array.from(document.querySelectorAll('.video-file-item')).find(item => 
            item.dataset.relativepath === relativePath
        );
        if (currentItem) {
            currentItem.classList.add('active');
        }
    }
}

// 刷新仪表板文件列表
async function refreshDashboardFiles(showToast = true) {
    const container = document.getElementById('dashboardFilesList');
    const button = document.querySelector('button[onclick="refreshDashboardFiles()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span>';
    }
    
    container.innerHTML = `
        <div class="d-flex justify-content-center align-items-center py-3">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <span class="text-muted">正在刷新...</span>
        </div>
    `;
    
    try {
        const response = await fetch('/api/files');
        const data = await response.json();
        
        if (data.files && Array.isArray(data.files)) {
            container.innerHTML = '';
            if (data.files.length === 0) {
                container.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-file-earmark-x" style="font-size: 3rem; opacity: 0.5;"></i>
                        <p class="mt-3 mb-0">暂无录制文件</p>
                        <small>开始录制后，文件将显示在这里</small>
                    </div>
                `;
                
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新完成', '暂无录制文件', 'info', 2000);
                }
            } else {
                // 显示最近的5个文件
                const recentFiles = data.files
                    .sort((a, b) => new Date(b.timeStr) - new Date(a.timeStr))
                    .slice(0, 5);
                
                recentFiles.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'video-file-item';
                    
                    const statusIcon = file.isRecording ? 
                        '<i class="bi bi-record-circle-fill text-danger"></i>' :
                        '<i class="bi bi-check-circle-fill text-success"></i>';
                    
                    const channelBadge = file.channel === 'videos1' ? 
                        '<span class="badge bg-primary">通道1</span>' :
                        '<span class="badge bg-success">通道2</span>';
                    
                    fileItem.innerHTML = `
                        <div class="file-icon">
                            <i class="bi bi-file-earmark-play"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-meta">
                                <span>${channelBadge}</span>
                                <span><i class="bi bi-hdd me-1"></i>${file.sizeStr}</span>
                                <span><i class="bi bi-calendar me-1"></i>${file.timeStr}</span>
                                <span>${statusIcon} ${file.isRecording ? '录制中' : '已完成'}</span>
                            </div>
                        </div>
                    `;
                    
                    // 添加点击事件
                    fileItem.addEventListener('click', () => {
                        if (file.relativePath) {
                            downloadFile(file.relativePath);
                        }
                    });
                    
                    container.appendChild(fileItem);
                });
                
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新成功', `显示最近 ${recentFiles.length} 个文件`, 'success', 2000);
                }
            }
        } else {
            throw new Error('无效的响应数据格式');
        }
    } catch (error) {
        console.error('刷新仪表板文件列表失败:', error);
        container.innerHTML = `
            <div class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
                <p class="mt-2 mb-0">加载失败</p>
                <small>${error.message}</small>
            </div>
        `;
        
        if (showToast && window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('刷新失败', '无法获取文件列表，请重试', 'error', 3000);
        }
    } finally {
        // 恢复按钮状态
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
        }
    }
}

// =================================================================================
// Video Preview Page Functions
// =================================================================================

// 过滤视频列表
function filterVideoList(filterType) {
    const container = document.getElementById('videoFilesList');
    if (!container) return;
    
    const videoItems = container.querySelectorAll('.video-file-item');
    
    videoItems.forEach(item => {
        const channelBadge = item.querySelector('.badge');
        let show = true;
        
        if (filterType === 'previewChannel1') {
            show = channelBadge && channelBadge.textContent.includes('通道1');
        } else if (filterType === 'previewChannel2') {
            show = channelBadge && channelBadge.textContent.includes('通道2');
        }
        // previewAll 显示所有
        
        item.style.display = show ? '' : 'none';
    });
}

// 按日期过滤视频
function filterVideoByDate() {
    const startDateInput = document.getElementById('previewStartDate');
    const endDateInput = document.getElementById('previewEndDate');
    const container = document.getElementById('videoFilesList');
    
    if (!container || !startDateInput || !endDateInput) return;
    
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    
    const videoItems = container.querySelectorAll('.video-file-item');
    
    videoItems.forEach(item => {
        const timeElement = item.querySelector('.bi-calendar');
        if (!timeElement || !timeElement.parentNode) return;
        
        const timeText = timeElement.parentNode.textContent.trim();
        const dateMatch = timeText.match(/(\d{4}-\d{2}-\d{2})/);
        
        if (!dateMatch) return;
        
        const fileDate = dateMatch[1];
        let show = true;
        
        if (startDate && fileDate < startDate) show = false;
        if (endDate && fileDate > endDate) show = false;
        
        item.style.display = show ? '' : 'none';
    });
}

// =================================================================================
// System Monitor Functions
// =================================================================================

// 刷新系统监控
async function refreshSystemMonitor() {
    const button = document.querySelector('button[onclick="refreshSystemMonitor()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span> 刷新中...';
    }
    
    if (window.app && typeof window.app.showToast === 'function') {
        window.app.showToast('开始刷新', '正在更新系统监控信息...', 'info', 2000);
    }
    
    try {
        if (window.app) {
            await window.app.updateSystemMonitor();
            
            if (window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新成功', '系统监控信息已更新', 'success', 2000);
            }
        }
    } catch (error) {
        console.error('刷新系统监控失败:', error);
        
        if (window.app && typeof window.app.showToast === 'function') {
            window.app.showToast('刷新失败', '无法更新系统监控信息', 'error', 3000);
        }
    } finally {
        // 恢复按钮状态
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> 刷新监控';
        }
    }
}

// =================================================================================
// Additional Missing Functions
// =================================================================================

// 清除视频过滤器
function clearVideoFilters() {
    // 重置日期过滤
    const startDateInput = document.getElementById('previewStartDate');
    const endDateInput = document.getElementById('previewEndDate');
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';
    
    // 重置频道过滤
    const allRadio = document.getElementById('previewAll');
    if (allRadio) allRadio.checked = true;
    
    // 显示所有视频
    const container = document.getElementById('videoFilesList');
    if (container) {
        const videoItems = container.querySelectorAll('.video-file-item');
        videoItems.forEach(item => {
            item.style.display = '';
        });
    }
}

// 清除视频日期过滤器（HTML中使用的函数名）
function clearVideoDateFilter() {
    clearVideoFilters();
}

// 下载当前播放的视频
function downloadCurrentVideo() {
    const downloadBtn = document.getElementById('downloadVideoBtn');
    if (downloadBtn && !downloadBtn.disabled) {
        const onclickAttr = downloadBtn.getAttribute('onclick');
        if (onclickAttr) {
            eval(onclickAttr);
        }
    } else {
        alert('请先选择一个视频播放');
    }
}

// 搜索视频
function searchVideos() {
    const searchInput = document.getElementById('videoSearchInput');
    const container = document.getElementById('video-preview-container');
    
    if (!searchInput || !container) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    const videoCards = container.querySelectorAll('.col-md-6, .col-lg-4');
    
    videoCards.forEach(card => {
        const titleElement = card.querySelector('.card-title');
        const fileName = titleElement ? titleElement.textContent.toLowerCase() : '';
        
        const show = !searchTerm || fileName.includes(searchTerm);
        card.style.display = show ? '' : 'none';
    });
}

// 批量删除视频
async function deleteSelectedVideos() {
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请先选择要删除的视频');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${checkboxes.length} 个视频吗？此操作不可撤销。`)) {
        return;
    }
    
    let successCount = 0;
    const errors = [];
    
    for (const checkbox of checkboxes) {
        try {
            const filePath = checkbox.dataset.filepath;
            const fileName = checkbox.dataset.filename;
            
            const response = await fetch('/api/delete-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath, fileName })
            });
            
            const result = await response.json();
            if (response.ok && result.success) {
                successCount++;
            } else {
                throw new Error(result.message || '删除失败');
            }
        } catch (error) {
            errors.push(`${checkbox.dataset.filename}: ${error.message}`);
        }
    }
    
    let message = `删除操作完成。成功: ${successCount} 个，失败: ${errors.length} 个`;
    if (errors.length > 0) {
        message += `\n失败详情:\n${errors.join('\n')}`;
    }
    alert(message);
    
    // 刷新视频列表
    refreshVideoList();
}

// 批量下载视频
function downloadSelectedVideos() {
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请先选择要下载的视频');
        return;
    }
    
    checkboxes.forEach(checkbox => {
        const relativePath = checkbox.dataset.relativepath;
        if (relativePath) {
            downloadFile(relativePath);
        }
    });
}

// 全选/取消全选视频
function toggleSelectAllVideos() {
    const selectAllCheckbox = document.getElementById('selectAllVideos');
    const videoCheckboxes = document.querySelectorAll('.video-checkbox');
    
    if (!selectAllCheckbox) return;
    
    videoCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateVideoSelectionButtons();
}

// 更新视频选择按钮状态
function updateVideoSelectionButtons() {
    const checkedBoxes = document.querySelectorAll('.video-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedVideosBtn');
    const downloadBtn = document.getElementById('downloadSelectedVideosBtn');
    const counter = document.getElementById('selectedVideosCounter');
    
    const hasSelection = checkedBoxes.length > 0;
    
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
    if (downloadBtn) downloadBtn.disabled = !hasSelection;
    if (counter) counter.textContent = `已选择 ${checkedBoxes.length} 个视频`;
}

// =================================================================================
// Enhanced Error Handling
// =================================================================================

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('JavaScript错误:', event.error);
    if (window.app) {
        window.app.addLog(`JavaScript错误: ${event.error.message}`, 'error');
    }
});

// 未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的Promise拒绝:', event.reason);
    if (window.app) {
        window.app.addLog(`网络错误: ${event.reason}`, 'error');
    }
    event.preventDefault();
});

// 刷新正在录制的文件列表
function refreshRecordingFiles(showToast = true) {
    const container = document.getElementById('currentRecordingList');
    const button = document.querySelector('button[onclick="refreshRecordingFiles()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span>';
    }
    
    container.innerHTML = `
        <div class="empty-state-compact">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <p>正在刷新...</p>
        </div>
    `;
    
    fetch('/api/files')
        .then(response => response.json())
        .then(data => {
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                // 过滤正在录制的文件
                const recordingFiles = data.files.filter(file => file.isRecording);
                if (recordingFiles.length > 0) {
                    container.innerHTML = recordingFiles.map(file => createRecordingFileRow(file)).join('');
                    // 显示成功提示
                    if (showToast && window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('刷新成功', `找到 ${recordingFiles.length} 个正在录制的文件`, 'success', 2000);
                    }
                } else {
                    container.innerHTML = `
                        <div class="empty-state-compact">
                            <i class="bi bi-pause-circle"></i>
                            <p>当前没有正在录制的文件</p>
                        </div>
                    `;
                    if (showToast && window.app && typeof window.app.showToast === 'function') {
                        window.app.showToast('刷新完成', '当前没有正在录制的文件', 'info', 2000);
                    }
                }
            } else {
                container.innerHTML = `
                    <div class="empty-state-compact">
                        <i class="bi bi-pause-circle"></i>
                        <p>当前没有正在录制的文件</p>
                    </div>
                `;
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新完成', '当前没有正在录制的文件', 'info', 2000);
                }
            }
        })
        .catch(error => {
            console.error('刷新录制文件失败:', error);
            container.innerHTML = `
                <div class="empty-state-compact">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p>加载失败，请重试</p>
                </div>
            `;
            if (showToast && window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新失败', '无法获取录制文件列表，请重试', 'error', 3000);
            }
        })
        .finally(() => {
            // 恢复按钮状态
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            }
        });
}

// 刷新所有录制文件列表
function refreshAllRecordingFiles(showToast = true) {
    const container = document.getElementById('allRecordingFilesList');
    const button = document.querySelector('button[onclick="refreshAllRecordingFiles()"]');
    
    // 显示加载状态
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> <span class="spinner-border spinner-border-sm ms-1" role="status"></span>';
    }
    
    container.innerHTML = `
        <div class="empty-state-compact">
            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
            <p>正在刷新...</p>
        </div>
    `;
    
    fetch('/api/files')
        .then(response => response.json())
        .then(data => {
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                // 按时间倒序排列，取最近的20个文件
                const sortedFiles = data.files
                    .sort((a, b) => new Date(b.timeStr) - new Date(a.timeStr))
                    .slice(0, 20);
                container.innerHTML = sortedFiles.map(file => createAllRecordingFileRow(file)).join('');
                
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新成功', `显示最近 ${sortedFiles.length} 个录制文件`, 'success', 2000);
                }
            } else {
                container.innerHTML = `
                    <div class="empty-state-compact">
                        <i class="bi bi-folder2-open"></i>
                        <p>暂无录制文件</p>
                    </div>
                `;
                if (showToast && window.app && typeof window.app.showToast === 'function') {
                    window.app.showToast('刷新完成', '暂无录制文件', 'info', 2000);
                }
            }
        })
        .catch(error => {
            console.error('刷新所有录制文件失败:', error);
            container.innerHTML = `
                <div class="empty-state-compact">
                    <i class="bi bi-exclamation-triangle"></i>
                    <p>加载失败，请重试</p>
                </div>
            `;
            if (showToast && window.app && typeof window.app.showToast === 'function') {
                window.app.showToast('刷新失败', '无法获取文件列表，请重试', 'error', 3000);
            }
        })
        .finally(() => {
            // 恢复按钮状态
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="bi bi-arrow-clockwise"></i>';
            }
        });
}