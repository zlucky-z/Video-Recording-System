#include "httplib.hpp"
#include "json.hpp"
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <unistd.h>
#include <signal.h>
#include <sstream>
#include <sys/stat.h>
#include <dirent.h>
#include <algorithm>
#include <iomanip>
#include <cctype>
#include <sys/wait.h> // for WEXITSTATUS
#include <csignal>

using json = nlohmann::json;
using namespace httplib;

// 全局变量 - 照搬 lintech 版本
std::mutex configMutex;
std::atomic<bool> recording1(false);
std::atomic<bool> recording2(false);
std::atomic<bool> stopTimerThread(false);
bool isFfmpegRunning = false;
bool isFfmpegRunning2 = false;

// 录制配置结构体
struct RecordingConfig {
    std::string rtsp_url1;
    std::string rtsp_url2;
    std::string save_path1;
    std::string save_path2;
    int segment_time;
    bool dual_stream_enabled;
    
    RecordingConfig() : segment_time(600), dual_stream_enabled(true) {}
};

RecordingConfig config;

// 全局变量用于存储开机自启的默认视频流地址和保存地址
std::string defaultRtspStreamUrl;
std::string defaultSaveLocation;
std::string defaultRtspStreamUrl2;
std::string defaultSaveLocation2;
int defaultSegmentTime = 600;
std::chrono::time_point<std::chrono::system_clock> startRecordingTime;

// TF卡信息结构体
struct TFCardInfo {
    std::string mountPath;
    std::string totalSpace;
    std::string usedSpace;
    std::string freeSpace;
    std::string usagePercent;
};

struct CommandResult {
    std::string output;
    int exit_status;
};

CommandResult executeCommandWithStatus(const std::string& command) {
    char buffer[1024];
    std::string output;
    FILE* pipe = popen(command.c_str(), "r");
    if (!pipe) {
        return {"", -1};
    }
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        output += buffer;
    }
    int status = pclose(pipe);
    return {output, WEXITSTATUS(status)};
}

// 简化的命令执行函数，只返回输出
std::string executeCommand(const std::string& command) {
    char buffer[1024];
    std::string output;
    FILE* pipe = popen(command.c_str(), "r");
    if (!pipe) {
        return "";
    }
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        output += buffer;
    }
    pclose(pipe);
    return output;
}

// 获取TF卡详细信息
TFCardInfo getTFCardInfo() {
    TFCardInfo info;
    info.mountPath = "/mnt/tfcard";
    
    std::string dfCommand = "df -h " + info.mountPath + " 2>/dev/null";
    std::string output = executeCommand(dfCommand);
    
    if (!output.empty()) {
        std::istringstream iss(output);
        std::string line;
        std::getline(iss, line); // 跳过标题行
        if (std::getline(iss, line)) {
            std::istringstream lineStream(line);
            std::string filesystem;
            lineStream >> filesystem >> info.totalSpace >> info.usedSpace 
                      >> info.freeSpace >> info.usagePercent;
        }
    }
    
    return info;
}

// 等待挂载点可用
bool waitForMountPoint(const std::string &mountPath, int maxWaitSeconds = 45) {
    int waitSeconds = 0;
    struct stat sb;
    while (stat(mountPath.c_str(), &sb) != 0) {
        if (waitSeconds >= maxWaitSeconds) {
            std::cerr << "等待TF卡挂载超时,挂载点 " << mountPath << " 不可用。" << std::endl;
            return false;
        }
        std::this_thread::sleep_for(std::chrono::seconds(1));
        waitSeconds++;
    }
    return true;
}

// 加载配置文件
void loadConfig() {
    std::lock_guard<std::mutex> lock(configMutex);
    std::ifstream file("config.json");
    if (file.is_open()) {
        try {
            json j;
            file >> j;
            config.rtsp_url1 = j.value("rtsp_url1", "rtsp://192.168.1.63:554/media/video1");
            config.rtsp_url2 = j.value("rtsp_url2", "rtsp://192.168.1.63:554/media/video2");
            config.save_path1 = j.value("save_path1", "/mnt/tfcard/videos1");
            config.save_path2 = j.value("save_path2", "/mnt/tfcard/videos2");
            config.segment_time = j.value("segment_time", 600);
            config.dual_stream_enabled = j.value("dual_stream_enabled", true);
            file.close();
        } catch (const std::exception& e) {
            std::cerr << "配置文件解析错误: " << e.what() << std::endl;
        }
    } else {
        config.rtsp_url1 = "rtsp://192.168.1.63:554/media/video1";
        config.rtsp_url2 = "rtsp://192.168.1.63:554/media/video2";
        config.save_path1 = "/mnt/tfcard/videos1";
        config.save_path2 = "/mnt/tfcard/videos2";
        config.segment_time = 600;
        config.dual_stream_enabled = true;
    }
}

// 保存配置文件
void saveConfig() {
    std::lock_guard<std::mutex> lock(configMutex);
    json j;
    j["rtsp_url1"] = config.rtsp_url1;
    j["rtsp_url2"] = config.rtsp_url2;
    j["save_path1"] = config.save_path1;
    j["save_path2"] = config.save_path2;
    j["segment_time"] = config.segment_time;
    j["dual_stream_enabled"] = config.dual_stream_enabled;
    
    std::ofstream file("config.json");
    if (file.is_open()) {
        file << j.dump(4);
        file.close();
    }
}

// 前向声明
void stopRecording();

// 完全照搬 lintech 的 startRecording 函数
void startRecording(const std::string &rtspStreamUrl = "", const std::string &saveLocation = "",
                    const std::string &rtspStreamUrl2 = "", const std::string &saveLocation2 = "")
{
    loadConfig();
    
    // 使用 config 中的值作为实际参数
    std::string actualRtspStreamUrl = rtspStreamUrl.empty() ? config.rtsp_url1 : rtspStreamUrl;
    std::string actualSaveLocation = saveLocation.empty() ? config.save_path1 : saveLocation;
    std::string actualRtspStreamUrl2 = rtspStreamUrl2.empty() ? config.rtsp_url2 : rtspStreamUrl2;
    std::string actualSaveLocation2 = saveLocation2.empty() ? config.save_path2 : saveLocation2;
    int segmentTime = config.segment_time;

    // 创建保存目录
    std::string mkdirCmd1 = "sudo mkdir -p " + actualSaveLocation;
    system(mkdirCmd1.c_str());
    
    // 如果启用双路录制，创建第二路的保存目录
    if (config.dual_stream_enabled) {
        std::string mkdirCmd2 = "sudo mkdir -p " + actualSaveLocation2;
        system(mkdirCmd2.c_str());
    }

    // 生成文件名相关逻辑
    std::string fileNameFormat = "%Y-%m-%d_%H-%M-%S.mp4";
    std::string fileNameFormat2 = "%Y-%m-%d_%H-%M-%S.mp4";

    // 构建第一路ffmpeg命令字符串
    std::string ffmpegCommand = "sudo ffmpeg -rtsp_transport tcp -i " + actualRtspStreamUrl + " -c:v copy -c:a aac -strict experimental -f segment -segment_time " + std::to_string(segmentTime) + " -reset_timestamps 1 -strftime 1 -segment_format mp4 " + actualSaveLocation + "/%Y-%m-%d_%H-%M-%S.mp4 2>/tmp/ffmpeg1.log";
    std::cout << "第一路 ffmpeg command: " << ffmpegCommand << std::endl;
    
    // 如果启用双路录制，构建第二路视频流的ffmpeg命令字符串
    std::string ffmpegCommand2;
    if (config.dual_stream_enabled) {
        ffmpegCommand2 = "sudo ffmpeg -rtsp_transport tcp -i " + actualRtspStreamUrl2 + " -c:v copy -c:a aac -strict experimental -f segment -segment_time " + std::to_string(segmentTime) + " -reset_timestamps 1 -strftime 1 -segment_format mp4 " + actualSaveLocation2 + "/%Y-%m-%d_%H-%M-%S.mp4 2>/tmp/ffmpeg2.log";
        std::cout << "第二路 ffmpeg command: " << ffmpegCommand2 << std::endl;
    } else {
        std::cout << "双路录制已禁用，只录制第一路视频流" << std::endl;
    }

    // 创建第一路录制线程
    std::thread ffmpegThread([ffmpegCommand]() {
        // 启动ffmpeg进程并获取PID
        int result = system(ffmpegCommand.c_str());
        
        // 尝试获取ffmpeg进程PID并写入文件
        std::string pidCmd = "pgrep -f 'ffmpeg.*" + config.rtsp_url1 + "' | head -1";
        FILE* pipe = popen(pidCmd.c_str(), "r");
        if (pipe) {
            char buffer[128];
            if (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
                std::string pidStr = buffer;
                pidStr.erase(pidStr.find_last_not_of(" \n\r\t")+1);
                std::ofstream pidFile("/tmp/recording1.pid");
                if (pidFile.is_open()) {
                    pidFile << pidStr;
                    pidFile.close();
                }
            }
            pclose(pipe);
        }
        
        if (result == -1) {
            std::cerr << "Error starting ffmpeg process." << std::endl;
        }
        recording1.store(false);
    });

    // 立即设置第一路录制标志位
    recording1.store(true);
    
    // 如果启用双路录制，创建第二路录制线程
    if (config.dual_stream_enabled) {
        std::thread ffmpegThread2([ffmpegCommand2]() {
            // 启动ffmpeg进程并获取PID
            int result2 = system(ffmpegCommand2.c_str());
            
            // 尝试获取ffmpeg进程PID并写入文件
            std::string pidCmd = "pgrep -f 'ffmpeg.*" + config.rtsp_url2 + "' | head -1";
            FILE* pipe = popen(pidCmd.c_str(), "r");
            if (pipe) {
                char buffer[128];
                if (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
                    std::string pidStr = buffer;
                    pidStr.erase(pidStr.find_last_not_of(" \n\r\t")+1);
                    std::ofstream pidFile("/tmp/recording2.pid");
                    if (pidFile.is_open()) {
                        pidFile << pidStr;
                        pidFile.close();
                    }
                }
                pclose(pipe);
            }
            
            if (result2 == -1) {
                std::cerr << "Error starting ffmpeg process for stream 2." << std::endl;
            }
            recording2.store(false);
        });

        // 立即设置第二路录制标志位
        recording2.store(true);

        // 分离第二路线程，让它在后台运行
        ffmpegThread2.detach();
        
        std::cout << "双路录制线程已启动并分离" << std::endl;
    } else {
        // 如果禁用双路录制，确保第二路标志位为false
        recording2.store(false);
        
        std::cout << "单路录制线程已启动并分离" << std::endl;
    }
    
    // 分离第一路线程，让它在后台运行
    ffmpegThread.detach();
}

// 完全照搬 lintech 的 stopRecording 函数
void stopRecording()
{
    std::cout << "准备停止录制..." << std::endl;
    // Kill ffmpeg processes using pkill
    system("pkill -f ffmpeg");

    // 清理PID文件
    remove("/tmp/recording1.pid");
    remove("/tmp/recording2.pid");

    recording1.store(false);
    recording2.store(false);
    std::cout << "所有FFmpeg进程已停止，PID文件已清理。" << std::endl;
}

// 文件信息结构体
struct FileInfo {
    std::string name;
    std::string fullPath;
    std::string relativePath;
    long long size;
    std::time_t modifyTime;
    std::string sizeStr;
    std::string timeStr;
    std::string channel;
    bool isRecording;
    std::string recordingDuration; // 新增：录制时长
};

// 格式化文件大小
std::string formatFileSize(long long bytes) {
    const char* units[] = {"B", "KB", "MB", "GB", "TB"};
    int unit = 0;
    double size = bytes;
    
    while (size >= 1024 && unit < 4) {
        size /= 1024;
        unit++;
    }
    
    char buffer[64];
    if (unit == 0) {
        snprintf(buffer, sizeof(buffer), "%lld %s", bytes, units[unit]);
    } else {
        snprintf(buffer, sizeof(buffer), "%.2f %s", size, units[unit]);
    }
    return std::string(buffer);
}

// 格式化时间
std::string formatTime(std::time_t time) {
    char buffer[64];
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", std::localtime(&time));
    return std::string(buffer);
}

// 获取详细的文件列表
std::vector<FileInfo> getVideoFilesDetailed() {
    std::vector<FileInfo> files;
    
    auto addFiles = [&](const std::string& path, const std::string& channel) {
        DIR* dir = opendir(path.c_str());
        if (dir) {
            struct dirent* entry;
            while ((entry = readdir(dir)) != nullptr) {
                std::string filename = entry->d_name;
                if (filename.find(".mp4") != std::string::npos) {
                    FileInfo fileInfo;
                    fileInfo.name = filename;
                    fileInfo.fullPath = path + "/" + filename;
                    fileInfo.relativePath = channel + "/" + filename;
                    fileInfo.channel = channel;
                    
                    struct stat fileStat;
                    if (stat(fileInfo.fullPath.c_str(), &fileStat) == 0) {
                        fileInfo.size = fileStat.st_size;
                        fileInfo.modifyTime = fileStat.st_mtime;
                        fileInfo.sizeStr = formatFileSize(fileStat.st_size);
                        fileInfo.timeStr = formatTime(fileStat.st_mtime);
                        
                        // 检查文件是否正在被写入 (缩短判断阈值提高敏感度)
                        std::time_t now = std::time(nullptr);
                        fileInfo.isRecording = (now - fileStat.st_mtime) < 5;
                        
                        files.push_back(fileInfo);
                    }
                }
            }
            closedir(dir);
        }
    };
    
    addFiles(config.save_path1, "videos1");
    addFiles(config.save_path2, "videos2");
    
    // 按修改时间排序
    std::sort(files.begin(), files.end(), [](const FileInfo& a, const FileInfo& b) {
        return a.modifyTime > b.modifyTime;
    });
    
    return files;
}

// 获取ffmpeg进程的运行时间
std::string getFfmpegRunningTime(const std::string& rtspUrl) {
    // 使用ps命令获取ffmpeg进程信息
    std::string psCommand = "ps -eo pid,etime,cmd | grep 'ffmpeg.*" + rtspUrl + "' | grep -v grep | head -1";
    std::string output = executeCommand(psCommand);
    
    if (!output.empty()) {
        std::istringstream iss(output);
        std::string pid, etime, cmd;
        iss >> pid >> etime;
        
        // etime格式可能是 MM:SS 或 HH:MM:SS 或 DD-HH:MM:SS
        return etime;
    }
    
    return "00:00:00";
}

// 将etime格式转换为标准格式
std::string formatElapsedTime(const std::string& etime) {
    if (etime.empty() || etime == "00:00:00") {
        return "00:00:00";
    }
    
    // 处理不同的etime格式
    if (etime.find('-') != std::string::npos) {
        // 格式：DD-HH:MM:SS
        size_t dashPos = etime.find('-');
        std::string days = etime.substr(0, dashPos);
        std::string timepart = etime.substr(dashPos + 1);
        
        // 转换天数为小时并加到时间部分
        int dayCount = std::stoi(days);
        size_t colonPos = timepart.find(':');
        int hours = std::stoi(timepart.substr(0, colonPos)) + dayCount * 24;
        
        return std::to_string(hours) + timepart.substr(colonPos);
    } else if (std::count(etime.begin(), etime.end(), ':') == 1) {
        // 格式：MM:SS，需要补充小时
        return "00:" + etime;
    } else {
        // 格式：HH:MM:SS，直接返回
        return etime;
    }
}

// 获取正在录制的文件
std::vector<FileInfo> getCurrentRecordingFiles() {
    std::vector<FileInfo> allFiles = getVideoFilesDetailed();
    std::vector<FileInfo> recordingFiles;
    
    for (auto& file : allFiles) {
        if (file.isRecording) {
            // 根据通道获取对应的录制时长
            std::string rtspUrl;
            if (file.channel == "videos1") {
                rtspUrl = config.rtsp_url1;
            } else if (file.channel == "videos2") {
                rtspUrl = config.rtsp_url2;
            }
            
            if (!rtspUrl.empty()) {
                std::string etime = getFfmpegRunningTime(rtspUrl);
                file.recordingDuration = formatElapsedTime(etime);
            } else {
                file.recordingDuration = "00:00:00";
            }
            
            recordingFiles.push_back(file);
        }
    }
    
    return recordingFiles;
}

// 检查 ffmpeg 进程是否正在运行
bool checkFfmpegRunning() {
    std::string pgrepCommand = "pgrep ffmpeg";
    FILE *pipe = popen(pgrepCommand.c_str(), "r");
    if (!pipe) {
        return false;
    }
    char buffer[128];
    std::string result = "";
    while (fgets(buffer, sizeof(buffer), pipe) != NULL) {
        result += buffer;
    }
    pclose(pipe);
    
    // 如果有输出说明有 ffmpeg 进程在运行
    return !result.empty() && result != "\n";
}

// Helper function to check if a process is running using its PID file
bool isProcessRunning(const std::string& pid_file) {
    std::ifstream file(pid_file);
    if (!file.is_open()) {
        return false;
    }
    pid_t pid;
    file >> pid;
    file.close();
    // kill with signal 0 is a standard way to check for process existence
    return (kill(pid, 0) == 0);
}

int main() {
    std::cout << "视频录制系统启动中..." << std::endl;
    
    // 等待TF卡挂载
    const std::string tfMountPath = "/mnt/tfcard";
    if (!waitForMountPoint(tfMountPath)) {
        std::cerr << "TF卡挂载失败，程序退出" << std::endl;
        return 1;
    }
    
    // 初始化配置
    std::cout << "初始化配置..." << std::endl;
    loadConfig();
    std::cout << "配置初始化完成" << std::endl;
    
    std::cout << "创建HTTP服务器..." << std::endl;
    Server svr;
    
    // 设置请求日志
    svr.set_logger([](const Request& req, const Response& res) {
        std::cout << "[" << std::chrono::duration_cast<std::chrono::seconds>(
            std::chrono::system_clock::now().time_since_epoch()).count() 
                  << "] " << req.method << " " << req.path << " - " << res.status << std::endl;
    });
    
    // 设置静态文件目录
    std::cout << "设置静态文件目录..." << std::endl;
    if (!svr.set_mount_point("/", "./web")) {
        std::cerr << "错误：无法设置静态文件目录 ./web" << std::endl;
        return 1;
    }
    std::cout << "静态文件目录设置成功" << std::endl;
    
    // API: 获取系统状态
    svr.Get("/api/status", [](const Request& /* req */, Response& res) {
        // 使用精确的PID文件检查来确定每一路的录制状态
        bool is_recording1 = isProcessRunning("/tmp/recording1.pid");
        bool is_recording2 = isProcessRunning("/tmp/recording2.pid");
        
        // 同步全局原子标志位
        recording1.store(is_recording1);
        recording2.store(is_recording2);
        
        TFCardInfo tfInfo = getTFCardInfo();
        
        json response;
        response["recording1"] = is_recording1;
        response["recording2"] = is_recording2;
        
        response["tfcard"]["mountPath"] = tfInfo.mountPath;
        response["tfcard"]["totalSpace"] = tfInfo.totalSpace;
        response["tfcard"]["usedSpace"] = tfInfo.usedSpace;
        response["tfcard"]["freeSpace"] = tfInfo.freeSpace;
        response["tfcard"]["usagePercent"] = tfInfo.usagePercent;
        
        // 添加 Cache-Control 头防止缓存
        res.set_header("Cache-Control", "no-cache, no-store, must-revalidate");
        res.set_header("Pragma", "no-cache");
        res.set_header("Expires", "0");
        res.set_content(response.dump(), "application/json");
    });
    
    // API: 开始录制
    svr.Post("/api/start", [](const Request& req, Response& res) {
        try {
            // 如果前端发送了配置，则使用该配置
            if (!req.body.empty()) {
                json reqJson = json::parse(req.body);
                if (reqJson.contains("rtsp_url1")) config.rtsp_url1 = reqJson["rtsp_url1"];
                if (reqJson.contains("rtsp_url2")) config.rtsp_url2 = reqJson["rtsp_url2"];
                if (reqJson.contains("save_path1")) config.save_path1 = reqJson["save_path1"];
                if (reqJson.contains("save_path2")) config.save_path2 = reqJson["save_path2"];
                if (reqJson.contains("segment_time")) config.segment_time = reqJson["segment_time"];
                if (reqJson.contains("dual_stream_enabled")) config.dual_stream_enabled = reqJson["dual_stream_enabled"];
            }

            startRecording("", "", "", "");
            res.set_content("{\"success\": true, \"message\": \"录制已启动\"}", "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("启动录制失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 停止录制
    svr.Post("/api/stop", [](const Request& /* req */, Response& res) {
        try {
            stopRecording();
            res.set_content("{\"success\": true, \"message\": \"录制已停止\"}", "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("停止录制失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 更新配置
    svr.Post("/api/config", [](const Request& req, Response& res) {
        try {
            json reqJson = json::parse(req.body);
            
            if (reqJson.contains("rtsp_url1")) config.rtsp_url1 = reqJson["rtsp_url1"];
            if (reqJson.contains("rtsp_url2")) config.rtsp_url2 = reqJson["rtsp_url2"];
            if (reqJson.contains("save_path1")) config.save_path1 = reqJson["save_path1"];
            if (reqJson.contains("save_path2")) config.save_path2 = reqJson["save_path2"];
            if (reqJson.contains("segment_time")) config.segment_time = reqJson["segment_time"];
            if (reqJson.contains("dual_stream_enabled")) config.dual_stream_enabled = reqJson["dual_stream_enabled"];
            
            saveConfig();
            
            res.set_content("{\"success\": true, \"message\": \"配置已更新\"}", "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("更新配置失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 获取配置
    svr.Get("/api/config", [](const Request& /* req */, Response& res) {
        loadConfig();
        json response;
        response["rtsp_url1"] = config.rtsp_url1;
        response["rtsp_url2"] = config.rtsp_url2;
        response["save_path1"] = config.save_path1;
        response["save_path2"] = config.save_path2;
        response["segment_time"] = config.segment_time;
        response["dual_stream_enabled"] = config.dual_stream_enabled;
        
        res.set_content(response.dump(), "application/json");
    });
    
    // API: 获取详细文件列表
    svr.Get("/api/files", [](const Request& /* req */, Response& res) {
        try {
            std::vector<FileInfo> files = getVideoFilesDetailed();
            json response;
            response["success"] = true;
            response["files"] = json::array();
            
            for (const auto& file : files) {
                json fileJson;
                fileJson["name"] = file.name;
                fileJson["fullPath"] = file.fullPath;
                fileJson["relativePath"] = file.relativePath;
                fileJson["size"] = file.size;
                fileJson["sizeStr"] = file.sizeStr;
                fileJson["modifyTime"] = file.modifyTime;
                fileJson["timeStr"] = file.timeStr;
                fileJson["channel"] = file.channel;
                fileJson["isRecording"] = file.isRecording;
                response["files"].push_back(fileJson);
            }
            
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("获取文件列表失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 获取正在录制的文件
    svr.Get("/api/recording-files", [](const Request& /* req */, Response& res) {
        try {
            std::vector<FileInfo> files = getCurrentRecordingFiles();
            json response;
            response["success"] = true;
            response["files"] = json::array();
            
            for (const auto& file : files) {
                json fileJson;
                fileJson["name"] = file.name;
                fileJson["fullPath"] = file.fullPath;
                fileJson["relativePath"] = file.relativePath;
                fileJson["size"] = file.size;
                fileJson["sizeStr"] = file.sizeStr;
                fileJson["modifyTime"] = file.modifyTime;
                fileJson["timeStr"] = file.timeStr;
                fileJson["channel"] = file.channel;
                fileJson["isRecording"] = file.isRecording;
                response["files"].push_back(fileJson);
            }
            
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("获取正在录制文件失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 删除文件
    svr.Post("/api/delete-file", [](const Request& req, Response& res) {
        try {
            json reqJson = json::parse(req.body);
            std::string filePath = reqJson["filePath"];
            
            // 安全检查
            if (filePath.find(config.save_path1) != 0 && filePath.find(config.save_path2) != 0) {
                json error;
                error["success"] = false;
                error["message"] = "不允许删除此路径的文件";
                res.set_content(error.dump(), "application/json");
                return;
            }
            
            // 检查文件是否正在录制
            std::vector<FileInfo> recordingFiles = getCurrentRecordingFiles();
            for (const auto& file : recordingFiles) {
                if (file.fullPath == filePath) {
                    json error;
                    error["success"] = false;
                    error["message"] = "无法删除正在录制的文件";
                    res.set_content(error.dump(), "application/json");
                    return;
                }
            }
            
            // 删除文件
            std::string deleteCommand = "echo 'linaro' | sudo -S rm \"" + filePath + "\" 2>/dev/null";
            int deleteResult = system(deleteCommand.c_str());
            
            if (deleteResult == 0) {
                json response;
                response["success"] = true;
                response["message"] = "文件删除成功";
                res.set_content(response.dump(), "application/json");
            } else {
                json error;
                error["success"] = false;
                error["message"] = "文件删除失败";
                res.set_content(error.dump(), "application/json");
            }
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("删除文件失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // API: 视频预览（支持Range请求）
    svr.Get("/api/preview/(.*)", [](const Request& req, Response& res) {
        try {
            std::string relativePath = req.matches[1];
            std::string fullPath;
            
            if (relativePath.find("videos1/") == 0) {
                fullPath = config.save_path1 + "/" + relativePath.substr(8);
            } else if (relativePath.find("videos2/") == 0) {
                fullPath = config.save_path2 + "/" + relativePath.substr(8);
            } else {
                res.status = 404;
                res.set_content("File not found", "text/plain");
                return;
            }
            
            std::ifstream file(fullPath, std::ios::binary | std::ios::ate);
            if (!file.is_open()) {
                res.status = 404;
                res.set_content("File not found", "text/plain");
                return;
            }
            
            size_t fileSize = file.tellg();
            file.seekg(0, std::ios::beg);
            
            std::string rangeHeader = req.get_header_value("Range");
            
            if (!rangeHeader.empty() && rangeHeader.find("bytes=") == 0) {
                std::string rangeSpec = rangeHeader.substr(6);
                size_t dashPos = rangeSpec.find('-');
                
                size_t start = 0;
                size_t end = fileSize - 1;
                
                if (dashPos != std::string::npos) {
                    std::string startStr = rangeSpec.substr(0, dashPos);
                    std::string endStr = rangeSpec.substr(dashPos + 1);
                    
                    if (!startStr.empty()) {
                        start = std::stoull(startStr);
                    }
                    if (!endStr.empty()) {
                        end = std::stoull(endStr);
                    }
                }
                
                if (start >= fileSize) start = fileSize - 1;
                if (end >= fileSize) end = fileSize - 1;
                if (start > end) start = end;
                
                size_t contentLength = end - start + 1;
                
                file.seekg(start);
                std::string content(contentLength, '\0');
                file.read(&content[0], contentLength);
                file.close();
                
                res.status = 206;
                res.set_header("Content-Type", "video/mp4");
                res.set_header("Content-Length", std::to_string(contentLength));
                res.set_header("Accept-Ranges", "bytes");
                res.set_header("Content-Range", "bytes " + std::to_string(start) + "-" + 
                              std::to_string(end) + "/" + std::to_string(fileSize));
                res.set_header("Cache-Control", "no-cache");
                
                res.set_content(content, "video/mp4");
            } else {
                std::string content(fileSize, '\0');
                file.read(&content[0], fileSize);
                file.close();
                
                // 检查是否是下载请求（通过查询参数判断）
                bool isDownload = req.has_param("download");
                
                res.set_header("Content-Type", "video/mp4");
                res.set_header("Content-Length", std::to_string(fileSize));
                res.set_header("Accept-Ranges", "bytes");
                res.set_header("Cache-Control", "no-cache");
                
                // 如果是下载请求，添加下载头信息
                if (isDownload) {
                    std::string fileName = relativePath.substr(relativePath.find_last_of('/') + 1);
                    res.set_header("Content-Disposition", "attachment; filename=\"" + fileName + "\"");
                }
                
                res.set_content(content, "video/mp4");
            }
        } catch (const std::exception& e) {
            res.status = 500;
            res.set_content("Preview failed: " + std::string(e.what()), "text/plain");
        }
    });

    // API: 上传文件到S3
    svr.Post("/api/upload-to-s3", [](const Request& req, Response& res) {
        try {
            json requestJson = json::parse(req.body);
            std::string filePath = requestJson["filePath"];
            std::string fileName = requestJson["fileName"];
            
            // 检查文件是否存在
            struct stat buffer;   
            if (stat(filePath.c_str(), &buffer) != 0) {
                json response;
                response["success"] = false;
                response["message"] = "文件不存在或无权访问: " + filePath;
                res.status = 404;
                res.set_content(response.dump(), "application/json");
                return;
            }
            
            // 构建Python脚本命令, 并重定向stderr到stdout
            std::string pythonCmd = "python3 /data/tra50/demo/upload_to_s3.py \"" + filePath + "\" \"" + fileName + "\" 2>&1";
            
            // 执行Python脚本
            CommandResult cmd_result = executeCommandWithStatus(pythonCmd);
            
            json response;
            if (cmd_result.exit_status == 0) {
                response["success"] = true;
                response["message"] = "文件上传到S3成功: " + fileName;
            } else {
                response["success"] = false;
                // 从命令输出中移除换行符
                if (!cmd_result.output.empty() && cmd_result.output.back() == '\n') {
                    cmd_result.output.pop_back();
                }
                response["message"] = "上传失败: " + (cmd_result.output.empty() ? "未知错误" : cmd_result.output);
            }
            
            res.set_content(response.dump(), "application/json");
            
        } catch (const std::exception& e) {
            json response;
            response["success"] = false;
            response["message"] = std::string("上传到S3失败 (C++ Exception): ") + e.what();
            res.status = 500;
            res.set_content(response.dump(), "application/json");
        }
    });
    
    // API: 获取系统监控信息
    svr.Get("/api/system-monitor", [](const Request& /* req */, Response& res) {
        try {
            json response;
            
            // 获取CPU使用率
            std::string cpuCmd = "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | sed 's/%us,//'";
            std::string cpuUsage = executeCommand(cpuCmd);
            if (!cpuUsage.empty()) {
                cpuUsage.erase(cpuUsage.find_last_not_of(" \n\r\t") + 1);
                response["cpu_usage"] = std::stod(cpuUsage.empty() ? "0" : cpuUsage);
            } else {
                response["cpu_usage"] = 0.0;
            }
            
            // 获取内存使用率
            std::string memCmd = "free | grep Mem | awk '{printf \"%.1f\", $3/$2 * 100.0}'";
            std::string memUsage = executeCommand(memCmd);
            if (!memUsage.empty()) {
                response["memory_usage"] = std::stod(memUsage);
            } else {
                response["memory_usage"] = 0.0;
            }
            
            // 获取磁盘使用率
            std::string diskCmd = "df /mnt/tfcard | tail -1 | awk '{print $5}' | sed 's/%//'";
            std::string diskUsage = executeCommand(diskCmd);
            if (!diskUsage.empty()) {
                diskUsage.erase(diskUsage.find_last_not_of(" \n\r\t") + 1);
                response["disk_usage"] = std::stod(diskUsage.empty() ? "0" : diskUsage);
            } else {
                response["disk_usage"] = 0.0;
            }
            
            // 获取系统负载
            std::string loadCmd = "uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//'";
            std::string loadAvg = executeCommand(loadCmd);
            if (!loadAvg.empty()) {
                loadAvg.erase(loadAvg.find_last_not_of(" \n\r\t") + 1);
                response["load_average"] = std::stod(loadAvg.empty() ? "0" : loadAvg);
            } else {
                response["load_average"] = 0.0;
            }
            
            // 获取系统运行时间
            std::string uptimeCmd = "uptime -p";
            std::string uptime = executeCommand(uptimeCmd);
            uptime.erase(uptime.find_last_not_of(" \n\r\t") + 1);
            response["uptime"] = uptime;
            
            // 获取温度信息
            std::string tempCmd = "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null";
            std::string temp = executeCommand(tempCmd);
            if (!temp.empty()) {
                temp.erase(temp.find_last_not_of(" \n\r\t") + 1);
                double tempCelsius = std::stod(temp.empty() ? "0" : temp) / 1000.0;
                response["temperature"] = tempCelsius;
            } else {
                response["temperature"] = 0.0;
            }
            
            response["success"] = true;
            response["timestamp"] = std::time(nullptr);
            
            res.set_content(response.dump(), "application/json");
        } catch (const std::exception& e) {
            json error;
            error["success"] = false;
            error["message"] = std::string("获取系统监控信息失败: ") + e.what();
            res.set_content(error.dump(), "application/json");
        }
    });
    
    std::cout << "视频录制服务器启动在端口 8060" << std::endl;
    std::cout << "访问地址: http://192.168.1.211:8060" << std::endl;
    std::cout << "开始监听连接..." << std::endl;
    
    if (!svr.listen("0.0.0.0", 8060)) {
        std::cerr << "错误：无法启动服务器在端口 8060" << std::endl;
        return 1;
    }
    
    return 0;
} 