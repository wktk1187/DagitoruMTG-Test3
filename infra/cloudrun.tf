resource "google_cloud_run_v2_service" "dagitoru_processor" {
  project  = data.google_project.current.project_id
  location = var.region
  name     = "dagitoru-processor" # Cloud Run service name (arbitrary)

  ingress = "INGRESS_TRAFFIC_ALL" # Allow all traffic for Pub/Sub push

  template {
    service_account = google_service_account.video_processor_sa.email
    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello" # Dummy image for now
      ports {
        container_port = 8080 # Port for the dummy image
      }
      resources {
        limits = {
          cpu    = "1000m" # 1 CPU
          memory = "512Mi" # 512MB (adjust as needed)
        }
      }
    }
    scaling {
      min_instance_count = 0 # Cost-effective, but cold starts
      max_instance_count = 1 # MVP: 1 instance (adjust as needed)
    }
    timeout = "900s" # Max execution time (e.g., 15 minutes, adjust as needed)
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

