resource "google_cloud_run_v2_service" "dagitoru_processor" {
  project  = data.google_project.current.project_id
  location = var.region
  name     = "dagitoru-processor" # Cloud Run service name (arbitrary)

  ingress = "INGRESS_TRAFFIC_ALL" # Allow all traffic for Pub/Sub push

  template {
    service_account = google_service_account.video_processor_sa.email
    containers {
      image = "asia-northeast1-docker.pkg.dev/mettinglog/dagitoru-repository/video-processor:latest" # Updated image path
      ports {
        container_port = 8080 # Port for the dummy image
      }
      resources {
        limits = {
          cpu    = "1000m" # 1 CPU
          memory = "1Gi" # 1GB (adjust as needed)
        }
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = data.google_project.current.project_id
      }
      env {
        name  = "GCS_BUCKET_NAME"
        value = google_storage_bucket.meeting_audio_staging.name
      }
      env {
        name  = "SLACK_BOT_TOKEN"
        value = var.slack_bot_token
      }
      env {
        name  = "CALLBACK_TO_VERCEL_URL"
        value = var.vercel_callback_url
      }
    }
    scaling {
      min_instance_count = 0 # Cost-effective, but cold starts
      max_instance_count = 2 # MVP: 2 instances (adjust as needed)
    }
    timeout = "1800s" # Max execution time (e.g., 30 minutes, adjust as needed)
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    prevent_destroy = false
  }
}

# Enable Cloud Run API for the project
resource "google_project_service" "run_api" {
  project = data.google_project.current.project_id
  service = "run.googleapis.com"

  disable_dependent_services = true # Enable dependent services as well
}

