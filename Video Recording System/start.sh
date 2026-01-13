#!/bin/bash

# 工业级视频录制系统启动脚本
# 
# 使用方法:
#   ./start.sh          - 前台运行
#   ./start.sh daemon   - 后台运行
#   ./start.sh stop     - 停止运行
#   ./start.sh restart  - 重启服务
#   ./start.sh status   - 查看状态

# 配置参数
PROGRAM_NAME="main"
PORT=8060
IP_ADDRESS="192.168.1.211"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印彩色输出
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    print_info "检查系统依赖..."
    
    # 检查编译工具
    if ! command -v g++ &> /dev/null; then
        print_error "g++ 编译器未安装，请运行: sudo apt-get install build-essential"
        return 1
    fi
    
    # 检查FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        print_error "FFmpeg 未安装，请运行: sudo apt-get install ffmpeg"
        return 1
    fi
    
    # 检查Make
    if ! command -v make &> /dev/null; then
        print_error "Make 工具未安装，请运行: sudo apt-get install make"
        return 1
    fi
    
    print_success "依赖检查完成"
    return 0
}

# 编译程序
compile_program() {
    print_info "编译程序..."
    
    if make clean && make; then
        print_success "编译完成"
        return 0
    else
        print_error "编译失败"
        return 1
    fi
}

# 挂载TF卡
mount_tfcard() {
    print_info "检查并挂载TF卡..."
    
    if [ -f "./mount_tfcard.sh" ]; then
        ./mount_tfcard.sh
        if [ $? -ne 0 ]; then
            print_error "TF卡挂载失败"
            return 1
        fi
    else
        print_warning "mount_tfcard.sh 脚本不存在，跳过自动挂载"
    fi
    
    return 0
}

# 创建必要目录
create_directories() {
    print_info "创建必要目录..."
    
    # 创建TF卡视频目录
    sudo mkdir -p /mnt/tfcard/videos1 2>/dev/null || true
    sudo mkdir -p /mnt/tfcard/videos2 2>/dev/null || true
    
    # 设置权限
    sudo chmod 755 /mnt/tfcard/videos1 2>/dev/null || true
    sudo chmod 755 /mnt/tfcard/videos2 2>/dev/null || true
    
    print_success "目录创建完成"
}

# 检查程序是否正在运行
is_running() {
    pgrep -f "$PROGRAM_NAME" > /dev/null 2>&1
}

# 获取进程ID
get_pid() {
    pgrep -f "$PROGRAM_NAME" 2>/dev/null
}

# 启动程序（前台）
start_foreground() {
    if is_running; then
        print_warning "程序已在运行中，PID: $(get_pid)"
        return 1
    fi
    
    # 挂载TF卡
    mount_tfcard
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    print_info "启动工业级视频录制系统..."
    print_info "访问地址: http://${IP_ADDRESS}:${PORT}"
    print_info "按 Ctrl+C 停止程序"
    print_info "========================================"
    
    sudo ./$PROGRAM_NAME
}

# 启动程序（后台）
start_daemon() {
    if is_running; then
        print_warning "程序已在运行中，PID: $(get_pid)"
        return 1
    fi
    
    # 挂载TF卡
    mount_tfcard
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    print_info "后台启动工业级视频录制系统..."
    
    nohup sudo ./$PROGRAM_NAME > recorder.log 2>&1 &
    
    sleep 2
    
    if is_running; then
        print_success "程序已后台启动，PID: $(get_pid)"
        print_info "访问地址: http://${IP_ADDRESS}:${PORT}"
        print_info "日志文件: recorder.log"
        print_info "使用 './start.sh status' 查看状态"
        print_info "使用 './start.sh stop' 停止程序"
    else
        print_error "程序启动失败，请检查日志文件 recorder.log"
        return 1
    fi
}

# 停止程序
stop_program() {
    if ! is_running; then
        print_warning "程序未运行"
        return 1
    fi
    
    local pid=$(get_pid)
    print_info "停止程序，PID: $pid"
    
    # 先尝试正常终止
    kill -TERM $pid 2>/dev/null
    
    # 等待程序退出
    for i in {1..10}; do
        if ! is_running; then
            print_success "程序已停止"
            return 0
        fi
        sleep 1
    done
    
    # 如果程序仍在运行，强制终止
    print_warning "正常终止失败，强制终止程序"
    kill -KILL $pid 2>/dev/null
    
    if ! is_running; then
        print_success "程序已强制停止"
    else
        print_error "无法停止程序"
        return 1
    fi
}

# 重启程序
restart_program() {
    print_info "重启程序..."
    stop_program
    sleep 2
    start_daemon
}

# 查看状态
show_status() {
    echo "========================================"
    echo " 工业级视频录制系统状态"
    echo "========================================"
    
    if is_running; then
        local pid=$(get_pid)
        print_success "程序正在运行"
        echo "PID: $pid"
        echo "访问地址: http://${IP_ADDRESS}:${PORT}"
        
        # 显示端口占用情况
        if command -v netstat &> /dev/null; then
            echo "端口占用:"
            netstat -tulpn | grep ":$PORT " 2>/dev/null || echo "  端口信息获取失败"
        fi
        
        # 显示内存使用
        if ps -p $pid -o pid,pcpu,pmem,cmd &> /dev/null; then
            echo "资源使用:"
            ps -p $pid -o pid,pcpu,pmem,cmd --no-headers | while read line; do
                echo "  $line"
            done
        fi
        
    else
        print_error "程序未运行"
    fi
    
    echo "========================================"
    
    # 显示最近的日志
    if [ -f "recorder.log" ]; then
        echo "最近日志:"
        tail -10 recorder.log 2>/dev/null || echo "无法读取日志文件"
    fi
}

# 显示帮助信息
show_help() {
    echo "工业级视频录制系统启动脚本"
    echo ""
    echo "使用方法:"
    echo "  $0              前台运行程序"
    echo "  $0 daemon       后台运行程序"
    echo "  $0 stop         停止程序"
    echo "  $0 restart      重启程序"
    echo "  $0 status       查看运行状态"
    echo "  $0 compile      仅编译程序"
    echo "  $0 install      安装依赖并编译"
    echo "  $0 help         显示此帮助信息"
    echo ""
    echo "访问地址: http://${IP_ADDRESS}:${PORT}"
}

# 安装系统
install_system() {
    print_info "开始安装工业级视频录制系统..."
    
    if ! check_dependencies; then
        print_error "依赖检查失败，请先安装必要的依赖"
        return 1
    fi
    
    create_directories
    
    if ! compile_program; then
        print_error "编译失败，安装中止"
        return 1
    fi
    
    print_success "安装完成！"
    print_info "使用 './start.sh daemon' 启动系统"
    print_info "使用 './start.sh help' 查看更多选项"
}

# 主逻辑
case "${1:-}" in
    "daemon")
        if [ ! -f "$PROGRAM_NAME" ]; then
            print_error "程序未编译，请先运行: $0 compile"
            exit 1
        fi
        start_daemon
        ;;
    "stop")
        stop_program
        ;;
    "restart")
        restart_program
        ;;
    "status")
        show_status
        ;;
    "compile")
        compile_program
        ;;
    "install")
        install_system
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    "")
        if [ ! -f "$PROGRAM_NAME" ]; then
            print_error "程序未编译，请先运行: $0 compile"
            exit 1
        fi
        start_foreground
        ;;
    *)
        print_error "未知参数: $1"
        show_help
        exit 1
        ;;
esac 