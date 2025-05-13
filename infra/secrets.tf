resource "google_secret_manager_secret" "callback_secret" {
  secret_id = "callback-secret"

  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "callback_secret_version" {
  secret      = google_secret_manager_secret.callback_secret.id
  secret_data = var.callback_secret
} 