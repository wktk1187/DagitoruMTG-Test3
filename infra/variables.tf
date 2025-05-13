variable "project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "region" {
  type        = string
  default     = "asia-northeast1"
  description = "GCP region"
}

variable "container_image" {
  type        = string
  description = "Artifact Registry URL of the Cloud Run Job container"
}

variable "gcs_bucket" {
  type        = string
  description = "Name of meetings GCS bucket"
}

variable "callback_url" {
  type        = string
  description = "Public HTTPS endpoint of /api/jobs/callback"
}

variable "callback_secret" {
  type        = string
  description = "Shared secret for callback auth"
}

variable "retention_days" {
  type        = number
  default     = 30
  description = "GCS object retention in days"
} 