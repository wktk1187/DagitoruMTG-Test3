resource "google_storage_bucket" "meeting_audio_staging" {
  project      = data.google_project.current.project_id
  name         = "${data.google_project.current.project_id}-meeting-audio-staging" # Unique bucket name
  location     = var.region
  storage_class = "STANDARD"

  uniform_bucket_level_access = true

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = 7 # Delete objects older than 7 days
    }
  }

  # versioning {
  #   enabled = true
  # }

  # public_access_prevention = "enforced" # Default is enforced
} 