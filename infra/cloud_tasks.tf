resource "google_cloud_tasks_queue" "notion_retry_queue" {
  name     = "notion-retry-queue"
  location = var.region

  retry_config {
    max_attempts = 5
    min_backoff  = "30s"
    max_backoff  = "600s" # 10分
    max_doublings = 5
  }

  rate_limits {
    max_dispatches_per_second = 1
    max_concurrent_dispatches = 1
  }
} 