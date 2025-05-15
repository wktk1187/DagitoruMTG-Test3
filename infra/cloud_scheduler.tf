# resource "google_cloud_scheduler_job" "notion_retry_schedule" {
#   name     = "notion-retry-schedule"
#   schedule = "0 * * * *" # 毎時0分
#   time_zone = "Asia/Tokyo"
#   http_target {
#     http_method = "POST"
#     # uri         = google_cloud_run_v2_job.notion_retry_job.uri # Cloud Run Jobにはuri属性がないためコメントアウト
#     oidc_token {
#       service_account_email = var.notion_retry_job_invoker_sa
#     }
#   }
# } 