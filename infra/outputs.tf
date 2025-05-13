output "pubsub_topic" {
  value = google_pubsub_topic.meeting_jobs.name
}

output "cloud_run_job_name" {
  value = google_cloud_run_v2_job.meeting_job.name
}

output "eventarc_trigger_name" {
  value = google_eventarc_trigger.job_trigger.name
} 