resource "google_pubsub_topic" "meeting_jobs_topic" {
  project = data.google_project.current.project_id
  name    = "meeting-jobs" # Pub/Sub topic name (arbitrary)

  labels = {
    environment = "dev"
    app         = "dagitoru"
  }
}

resource "google_pubsub_subscription" "meeting_jobs_push_subscription" {
  project = data.google_project.current.project_id
  name    = "meeting-jobs-push-to-cloudrun" # Subscription name (arbitrary)
  topic   = google_pubsub_topic.meeting_jobs_topic.name

  ack_deadline_seconds = 600 # Match Cloud Run timeout or slightly less

  push_config {
    push_endpoint = google_cloud_run_v2_service.dagitoru_processor.uri # Cloud Run service URI

    oidc_token {
      service_account_email = google_service_account.video_processor_sa.email # Changed to dedicated SA
      audience              = google_cloud_run_v2_service.dagitoru_processor.uri # Added audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  # Optional: Dead-letter topic configuration (recommended for production)
  # dead_letter_policy {
  #   dead_letter_topic = google_pubsub_topic.meeting_jobs_dead_letter_topic.id
  #   max_delivery_attempts = 5
  # }
  # resource "google_pubsub_topic" "meeting_jobs_dead_letter_topic" {
  #   project = data.google_project.current.project_id
  #   name    = "meeting-jobs-dlq"
  # }

  depends_on = [
    google_cloud_run_v2_service.dagitoru_processor,
    google_pubsub_topic.meeting_jobs_topic,
    google_service_account.video_processor_sa // Added explicit dependency
  ]
} 