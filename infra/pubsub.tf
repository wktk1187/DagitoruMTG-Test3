resource "google_pubsub_topic" "meeting_jobs" {
  name = "meeting-jobs"
}

# Push subscription removed; Eventarc will manage subscription 