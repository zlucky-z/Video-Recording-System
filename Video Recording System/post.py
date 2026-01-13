import boto3
from botocore.client import Config

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
        :return: True如果上传成功，否则False
        """
        if object_name is None:
            object_name = file_path.split('/')[-1]
        
        try:
            self.s3_client.upload_file(file_path, self.bucket_name, object_name)
            print(f"文件 {file_path} 成功上传到 {self.bucket_name}/{object_name}")
            return True
        except Exception as e:
            print(f"上传失败: {e}")
            return False

# 使用示例
if __name__ == "__main__":
    uploader = S3Uploader()
    
    # 上传文件
    uploader.upload_file("D:\VSCode\serial\python\Image.py", "Image.py")