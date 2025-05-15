variable "project_id" {
  description = "GCPプロジェクトID"
  type        = string
  # default     = "your-gcp-project-id" # Sourced from gcloud config by default
}
 
variable "region" {
  description = "GCPリージョン"
  type        = string
  default     = "asia-northeast1"
}

variable "service_account_name" {
  description = "サービスアカウント名"
  type        = string
  default     = "video-processing-sa"
}

variable "bucket_name" {
  description = "GCSバケット名"
  type        = string
}

variable "environment" {
  description = "環境名 (production/staging/dev など)"
  type        = string
}

variable "slack_bot_token" {
  description = "Slack Bot Token for the video processing service."
  type        = string
  sensitive   = true # Mark as sensitive so it's not shown in logs
}

variable "vercel_callback_url" {
  description = "The callback URL to the Vercel function (e.g., https://your-app.vercel.app/api/jobs/callback)."
  type        = string
}

variable "notion_api_key" {
  description = "Notion APIキー（Secret Manager格納用）"
  type        = string
  sensitive   = true
}

variable "notion_retry_job_image" {
  description = "notion-retry-job用のDockerイメージ（gcr.io/...）"
  type        = string
}

variable "notion_retry_job_cloud_run_url" {
  description = "Cloud Run Jobが呼び出すNotion再送エンドポイントのURL"
  type        = string
}

variable "notion_retry_job_invoker_sa" {
  description = "Cloud Tasks/Run Jobが使うInvokerサービスアカウント"
  type        = string
} 