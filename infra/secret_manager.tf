# resource "google_secret_manager_secret" "notion_api_key" {
#   project   = var.project_id
#   secret_id = "notion-api-key"
#   replication {
#     automatic {}
#   }
# }
#
# resource "google_secret_manager_secret_version" "notion_api_key_version" {
#   secret      = google_secret_manager_secret.notion_api_key.id
#   secret_data = var.notion_api_key
# }
#
# resource "google_secret_manager_secret" "slack_bot_token" {
#   project   = var.project_id
#   secret_id = "slack-bot-token"
#   replication {
#     automatic {}
#   }
# }
#
# resource "google_secret_manager_secret_version" "slack_bot_token_version" {
#   secret      = google_secret_manager_secret.slack_bot_token.id
#   secret_data = var.slack_bot_token
# }

# ※ 上記シークレットはGCPコンソールで手動作成・登録してください

# secretAccessor権限付与リソースは、手動作成したシークレット名に合わせて残す
resource "google_secret_manager_secret_iam_member" "notion_api_key_accessor" {
  secret_id = "projects/${var.project_id}/secrets/notion-api-key" # 手動作成したシークレット名に合わせる
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
}

resource "google_secret_manager_secret_iam_member" "slack_bot_token_accessor" {
  secret_id = "projects/${var.project_id}/secrets/slack-bot-token" # 手動作成したシークレット名に合わせる
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_sa.email}"
} 