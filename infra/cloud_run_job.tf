resource "google_cloud_run_v2_job" "notion_retry_job" {
  name     = "notion-retry-job"
  location = var.region
  template {
    template {
      containers {
        image = var.notion_retry_job_image # 例: gcr.io/your-project/notion-retry-job:latest
        env {
          name  = "PROJECT_ID"
          value = var.project_id
        }
        env {
          name  = "REGION"
          value = var.region
        }
        env {
          name  = "MAX_RETRY"
          value = "5"
        }
        env {
          name  = "CLOUD_RUN_URL"
          value = var.notion_retry_job_cloud_run_url
        }
        env {
          name  = "INVOKER_SA"
          value = var.notion_retry_job_invoker_sa
        }
      }
      service_account = google_service_account.cloudrun_sa.email
    }
  }
} 