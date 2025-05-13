# syntax=docker/dockerfile:1

FROM gcr.io/google.com/cloudsdktool/google-cloud-cli:slim

# ffmpeg インストール
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリ
WORKDIR /app

# requirements (Python) を利用する場合
# COPY requirements.txt ./
# RUN pip install --no-cache-dir -r requirements.txt

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"] 