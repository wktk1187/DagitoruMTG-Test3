# output "notion_api_key_secret_id" {
#   value = google_secret_manager_secret.notion_api_key.id
#   description = "Notion APIキーのSecret ManagerリソースID"
# }

output "cloudrun_service_account_email" {
  value = google_service_account.cloudrun_sa.email
  description = "Cloud Run用サービスアカウントのメールアドレス"
} 