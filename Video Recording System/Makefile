CXX = g++
CXXFLAGS = -std=c++17 -O0 -Wall -Wextra -pthread
CXXFLAGS_FAST = -std=c++17 -O0 -pthread  # 快速编译选项，无优化
INCLUDES = -I../lintech/celectronicfence
LIBS = -lpthread

TARGET = main
SOURCE = main.c

# 默认目标
all: $(TARGET)

# 编译目标
$(TARGET): $(SOURCE)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $(TARGET) $(SOURCE) $(LIBS)
	@echo "编译完成: $(TARGET)"

# 清理目标
clean:
	rm -f $(TARGET)
	rm -f *.o
	@echo "清理完成"

# 安装目标
install: $(TARGET)
	@echo "创建必要的目录..."
	mkdir -p /mnt/tfcard/videos1
	mkdir -p /mnt/tfcard/videos2
	@echo "设置权限..."
	chmod +x $(TARGET)
	@echo "安装完成"

# 运行目标
run: $(TARGET)
	./$(TARGET)

# 后台运行
daemon: $(TARGET)
	nohup ./$(TARGET) > recorder.log 2>&1 &
	@echo "后台运行已启动，日志文件: recorder.log"

# 停止后台运行
stop:
	pkill -f $(TARGET) || true
	@echo "已停止后台运行"

# 快速编译（无优化）
fast:
	$(CXX) $(CXXFLAGS_FAST) $(INCLUDES) -o $(TARGET) $(SOURCE) $(LIBS)
	@echo "快速编译完成: $(TARGET)"

# 开发模式运行（带调试信息）
debug: CXXFLAGS += -g -DDEBUG
debug: $(TARGET)
	./$(TARGET)

# 帮助信息
help:
	@echo "可用目标:"
	@echo "  all     - 编译程序（默认，带O2优化）"
	@echo "  fast    - 快速编译（无优化，编译速度快）"
	@echo "  clean   - 清理编译文件"
	@echo "  install - 安装程序和创建必要目录"
	@echo "  run     - 运行程序"
	@echo "  daemon  - 后台运行程序"
	@echo "  stop    - 停止后台运行"
	@echo "  debug   - 调试模式编译和运行"
	@echo "  help    - 显示此帮助信息"

.PHONY: all clean install run daemon stop debug fast help 