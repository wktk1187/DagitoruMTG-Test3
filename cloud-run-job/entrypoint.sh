#!/bin/sh
set -euo pipefail

echo "[Cloud Run Job] start - JOB_ID=${JOB_ID}"

# 必須変数チェック
: "${JOB_ID:?env not set}" "${VIDEO_GCS_URI:?env not set}" "${OUTPUT_PREFIX:?env not set}" "${CALLBACK_URL:?env not set}"

WORKDIR="/workspace"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# 1. GCS から動画ダウンロード
echo "[Download] $VIDEO_GCS_URI"
gsutil cp "$VIDEO_GCS_URI" ./video.mp4

# 2. ffmpeg で音声抽出 (FLAC)
echo "[FFmpeg] extracting audio"
ffmpeg -i video.mp4 -ac 1 -ar 16000 -c:a flac audio.flac -y

# 3. 成果物アップロード用 URI 生成
AUDIO_GCS_URI="${OUTPUT_PREFIX}/audio.flac"
TRANSCRIPT_GCS_URI="${OUTPUT_PREFIX}/transcript.json"

# 4. 音声ファイルを GCS へアップロード（STT で参照するため先にアップ）
echo "[Upload] $AUDIO_GCS_URI"
gsutil cp audio.flac "$AUDIO_GCS_URI"

# 5. Google Speech-to-Text 認識実行 (gcloud CLI)
echo "[STT] recognizing speech"
LANGUAGE_CODE=${LANGUAGE_CODE:-ja-JP}
gcloud ml speech recognize "$AUDIO_GCS_URI" --language-code="$LANGUAGE_CODE" --format=json > transcript.json

# 6. transcript.json を GCS へアップロード
echo "[Upload] $TRANSCRIPT_GCS_URI"
gsutil cp transcript.json "$TRANSCRIPT_GCS_URI"

# 7. Webhook Server へ callback POST
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer ${CALLBACK_SECRET}" \
  -d "{\"jobId\": \"$JOB_ID\", \"transcriptUri\": \"$TRANSCRIPT_GCS_URI\"}" "$CALLBACK_URL"

echo "[Cloud Run Job] completed" 