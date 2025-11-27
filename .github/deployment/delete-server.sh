#!/bin/bash
# ====================================================
# delete-server.sh (SAFE VERSION)
# Удаляет игровые серверы VIMP.
# ====================================================

echo "=================================================="
echo "   🗑️  VIMP SERVER DELETION TOOL"
echo "=================================================="

# Папка, где лежат проекты игр
PROJECTS_ROOT="$HOME/vimp_projects"

# 1. Собираем список валидных VIMP-серверов
# Логика: Берем конфиги Nginx И проверяем, есть ли для них папка проекта.
RAW_SITES=$(ls /etc/nginx/sites-enabled/ | grep -v "default")
VIMP_SITES=""

for site in $RAW_SITES; do
  if [ -d "$PROJECTS_ROOT/$site" ]; then
    # Это наш клиент!
    VIMP_SITES="$VIMP_SITES $site"
  fi
done

# Если список пуст
if [ -z "$VIMP_SITES" ]; then
  echo "❌ No VIMP game servers found."
  echo "   (Checked Nginx configs matching folders in $PROJECTS_ROOT)"
  exit 0
fi

# 2. Меню выбора
PS3="👉 Select a server to DELETE (enter number): "
select DOMAIN in $VIMP_SITES "Cancel"; do
  if [[ "$DOMAIN" == "Cancel" ]]; then
    echo "Action cancelled."
    exit 0
  elif [[ -n "$DOMAIN" ]]; then
    echo ""
    echo "🚨 WARNING: You are about to DELETE VIMP server: $DOMAIN"
    echo "   This will remove:"
    echo "   - Nginx configuration (/etc/nginx/sites-enabled/$DOMAIN)"
    echo "   - SSL Certificates (via Certbot)"
    echo "   - Docker Container (vimp-$DOMAIN)"
    echo "   - Project files ($PROJECTS_ROOT/$DOMAIN)"
    echo ""
    read -p "Are you sure? Type 'yes' to confirm: " CONFIRM

    if [[ "$CONFIRM" == "yes" ]]; then
      break
    else
      echo "❌ Cancelled."
      exit 0
    fi
  else
    echo "Invalid selection."
  fi
done

echo ""
echo "🔥 Deleting $DOMAIN..."

# ----------------------------------------------------
# 1. Docker
# ----------------------------------------------------
CONTAINER_NAME="vimp-$DOMAIN"
echo "🐳 Stopping Docker container: $CONTAINER_NAME..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# ----------------------------------------------------
# 2. Files
# ----------------------------------------------------
TARGET_DIR="$PROJECTS_ROOT/$DOMAIN"
if [ -d "$TARGET_DIR" ]; then
  echo "📂 Removing project directory: $TARGET_DIR..."
  rm -rf "$TARGET_DIR"
fi

# ----------------------------------------------------
# 3. Nginx Configs
# ----------------------------------------------------
echo "🌐 Removing Nginx configurations..."
sudo rm -f /etc/nginx/sites-enabled/$DOMAIN
sudo rm -f /etc/nginx/sites-available/$DOMAIN

# ----------------------------------------------------
# 4. SSL Certs
# ----------------------------------------------------
echo "🔐 Removing SSL certificates..."
sudo certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null || echo "   ⚠️  Certbot check skipped (cert might be gone)."

# ----------------------------------------------------
# 5. Reload
# ----------------------------------------------------
echo "🔄 Reloading Nginx..."
if sudo nginx -t; then
  sudo systemctl reload nginx
  echo "✅ SUCCESS! Server $DOMAIN has been deleted."
  echo "👉 Don't forget to remove it from servers.json in your repository!"
else
  echo "❌ Error reloading Nginx. Config check failed."
  sudo nginx -t
fi
