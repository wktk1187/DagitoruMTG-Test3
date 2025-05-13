resource "google_storage_bucket" "meetings" {
  name     = var.gcs_bucket
  location = var.region
  uniform_bucket_level_access = true
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.retention_days
    }
  }
  versioning {
    enabled = true
  }
}

resource "google_storage_bucket_iam_member" "cloud_run_job_writer" {
  bucket = google_storage_bucket.meetings.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_job.email}"
} 