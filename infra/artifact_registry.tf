resource "google_artifact_registry_repository" "dagitoru_repo" {
  provider      = google-beta
  project       = data.google_project.current.project_id
  location      = var.region
  repository_id = "dagitoru-repository"
  description   = "Repository for Dagitoru meeting log Docker images"
  format        = "DOCKER"

  lifecycle {
    prevent_destroy = false
  }
}

# Get current project ID
data "google_project" "current" {
  project_id = var.project_id
}

// Define region variable (will be formally defined in variables.tf later) 
// variable "region" { 
//   description = "The GCP region to deploy resources to." 
//   type        = string 
//   default     = "asia-northeast1" # Example: Tokyo region 
// } 