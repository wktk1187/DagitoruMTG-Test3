resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com",
    "eventarc.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "speech.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ])
  service = each.key
} 