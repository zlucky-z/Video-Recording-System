#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
import sys
import os

import sys; print(sys.executable)

class S3Uploader:
    def __init__(self):
        self.aws_access_key = "ePj9RapAJI31j36ZL4sZ"
        self.aws_secret_key = "amryv0sppaWgWLDE9K46tGj5leMYiAe7zd3rfV0g"
        self.bucket_name = "test"
        self.s3_endpoint = "http://101.37.202.178:9001"
        
        # 创建S3客户端
        self.s3_client = boto3.client(
            's3',
            endpoint_url=self.s3_endpoint,
            aws_access_key_id=self.aws_access_key,
            aws_secret_access_key=self.aws_secret_key,
            config=Config(signature_version='s3v4')
        )
    
    def upload_file(self, file_path, object_name=None):
        """
        上传文件到S3存储桶
        
        :param file_path: 本地文件路径
        :param object_name: S3中的对象名称(可选)，如果不指定则使用文件名
        :return: (True, None) 如果上传成功, (False, error_message) 如果失败
        """
        if object_name is None:
            object_name = os.path.basename(file_path)
        
        try:
            self.s3_client.upload_file(file_path, self.bucket_name, object_name)
            return True, None
        except (BotoCoreError, ClientError) as e:
            return False, str(e)

def main():
    if len(sys.argv) != 3:
        print(f"用法: {sys.argv[0]} <文件路径> <S3对象名>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    object_name = sys.argv[2]
    
    # 检查文件是否存在
    if not os.path.exists(file_path):
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)
    
    # 创建上传器并上传文件
    uploader = S3Uploader()
    success, error_message = uploader.upload_file(file_path, object_name)
    
    if success:
        sys.exit(0)
    else:
        print(error_message)
        sys.exit(1)

if __name__ == "__main__":
    main() 