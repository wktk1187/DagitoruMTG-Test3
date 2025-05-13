resource "google_cloud_run_v2_job" "meeting_job" {
  name     = "meeting-job"
  location = var.region

  template {
    template {
      service_account = google_service_account.cloud_run_job.email
      timeout_seconds = 3600
      max_retries     = 2

      containers {
        image = var.container_image
        resources {
          limits = {
            cpu    = "1"
            memory = "2Gi"
          }
        }
        env {
          name  = "CALLBACK_URL"
          value = var.callback_url
        }
        env {
          name  = "GCS_BUCKET"
          value = var.gcs_bucket
        }
        env {
          name = "CALLBACK_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.callback_secret.name
              version = "latest"
            }
          }
        }
      }
    }
  }
}

# Eventarc trigger for Pub/Sub to Cloud Run Job (direct)
resource "google_eventarc_trigger" "job_trigger" {
  name     = "meeting-job-trigger"
  location = var.region

  transport {
    pubsub {
      topic = google_pubsub_topic.meeting_jobs.id
    }
  }

  destination {
    cloud_run_job {
      job    = google_cloud_run_v2_job.meeting_job.name
      region = var.region
    }
  }

  service_account = google_service_account.eventarc_invoker.email
} 