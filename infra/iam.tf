# Cloud Run Job Service Account
resource "google_service_account" "cloud_run_job" {
  account_id   = "cloud-run-job-sa"
  display_name = "Cloud Run Job SA"
}

# Eventarc Invoker SA to allow Pub/Sub to invoke Cloud Run
resource "google_service_account" "eventarc_invoker" {
  account_id   = "eventarc-invoker-sa"
  display_name = "Eventarc Invoker SA"
}

# Bind roles to Cloud Run Job SA
resource "google_project_iam_member" "cloud_run_job_storage" {
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_job.email}"
}

resource "google_project_iam_member" "cloud_run_job_speech" {
  role   = "roles/cloudspeech.user"
  member = "serviceAccount:${google_service_account.cloud_run_job.email}"
}

resource "google_project_iam_member" "cloud_run_job_iam_token" {
  role   = "roles/iam.serviceAccountTokenCreator"
  member = "serviceAccount:${google_service_account.cloud_run_job.email}"
}

# Allow Eventarc Invoker to invoke Cloud Run service
resource "google_cloud_run_v2_job_iam_member" "eventarc_invoker_job" {
  location = var.region
  job      = google_cloud_run_v2_job.meeting_job.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.eventarc_invoker.email}"
} 