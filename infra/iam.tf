# IAM bindings for Cloud Run service

# Data source to get the default compute service account email (can be removed if not used elsewhere)
# data "google_compute_default_service_account" "default" {
#   project = data.google_project.current.project_id
# }

# Allow the video_processor_sa (which PubSub will use for OIDC token generation)
# to invoke the Cloud Run service.
resource "google_cloud_run_v2_service_iam_member" "video_processor_sa_can_invoke_self" { 
  project  = google_cloud_run_v2_service.dagitoru_processor.project
  location = google_cloud_run_v2_service.dagitoru_processor.location
  name     = google_cloud_run_v2_service.dagitoru_processor.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.video_processor_sa.email}"
}

# The previous invoker for the Google-managed Pub/Sub SA is removed as OIDC token
# will be based on video_processor_sa.
# resource "google_cloud_run_v2_service_iam_member" "dagitoru_processor_invoker" { ... }

# Example: Granting Pub/Sub Admin to the Cloud Run service account (if it needs to manage Pub/Sub)
# resource "google_project_iam_member" "cloud_run_pubsub_admin" {
#   project = data.google_project.current.project_id
#   role    = "roles/pubsub.admin" # Or more restrictive roles like roles/pubsub.publisher
#   member  = "serviceAccount:${data.google_compute_default_service_account.default.email}"
# }

# Example: Granting Speech-to-Text User to the Cloud Run service account (for future use)
# resource "google_project_iam_member" "cloud_run_speech_to_text_user" {
#   project = data.google_project.current.project_id
#   role    = "roles/speech.user"
#   member  = "serviceAccount:${data.google_compute_default_service_account.default.email}"
# }

# ---- Service Account for Video Processing (Speech-to-Text and GCS access) ----
resource "google_service_account" "video_processor_sa" {
  project      = data.google_project.current.project_id
  account_id   = "video-processor-sa"
  display_name = "Video Processor Service Account"
}

# Grant Speech-to-Text User role to the new service account
resource "google_project_iam_member" "video_processor_speech_user" {
  project = data.google_project.current.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.video_processor_sa.email}"
}

# Grant Storage Object Creator role to the new service account for the staging bucket
resource "google_storage_bucket_iam_member" "video_processor_gcs_creator" {
  bucket = google_storage_bucket.meeting_audio_staging.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.video_processor_sa.email}"
}

# Grant Storage Object Viewer role to the new service account for the staging bucket
resource "google_storage_bucket_iam_member" "video_processor_gcs_viewer" {
  bucket = google_storage_bucket.meeting_audio_staging.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.video_processor_sa.email}"
}

# (Optional) If Cloud Run needs to delete GCS objects after processing
# resource "google_storage_bucket_iam_member" "video_processor_gcs_deleter" {
#   bucket = google_storage_bucket.meeting_audio_staging.name
#   role   = "roles/storage.objectAdmin" 
#   member = "serviceAccount:${google_service_account.video_processor_sa.email}"
# }

# ---- End of Service Account for Video Processing ---- 