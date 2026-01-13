#!/bin/bash

# 自动挂载TF卡脚本
# 用于确保TF卡以正确的权限挂载

DEVICE="/dev/mmcblk1p1"
MOUNT_POINT="/mnt/tfcard"

# 检查设备是否存在
if [ ! -b "$DEVICE" ]; then
    echo "错误: TF卡设备 $DEVICE 不存在"
    exit 1
fi

# 检查挂载点是否存在
if [ ! -d "$MOUNT_POINT" ]; then
    echo "创建挂载点: $MOUNT_POINT"
    sudo mkdir -p "$MOUNT_POINT"
fi

# 如果已经挂载，先卸载
if mount | grep -q "$MOUNT_POINT"; then
    echo "TF卡已挂载，正在重新挂载..."
    sudo umount "$MOUNT_POINT"
    sleep 2
fi

# 挂载TF卡，设置正确的权限
echo "挂载TF卡到 $MOUNT_POINT"
sudo mount -t vfat -o rw,uid=1000,gid=1000,fmask=0000,dmask=0000 "$DEVICE" "$MOUNT_POINT"

if [ $? -eq 0 ]; then
    echo "TF卡挂载成功"
    
    # 创建录制目录
    mkdir -p "$MOUNT_POINT/videos1"
    mkdir -p "$MOUNT_POINT/videos2"
    
    echo "录制目录已创建"
    echo "挂载信息:"
    df -h "$MOUNT_POINT"
else
    echo "错误: TF卡挂载失败"
    exit 1
fi 