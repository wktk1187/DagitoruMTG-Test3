variable "project_id" {
  description = "The GCP project ID to deploy resources to."
  type        = string
  # default     = "your-gcp-project-id" # Sourced from gcloud config by default
}
 
variable "region" {
  description = "The GCP region to deploy resources to."
  type        = string
  default     = "asia-northeast1" # Example: Tokyo region. Change as needed.
} 