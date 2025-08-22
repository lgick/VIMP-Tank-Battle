#!/bin/bash
set -e

# ====== Функция вывода помощи ======
usage() {
  echo "Использование: $0 -d <домен> -e <email>"
  echo "  -d  Домен для сайта и SSL сертификата"
  echo "  -e  Email для регистрации SSL сертификата Let's Encrypt"
  exit 1
}

# ====== Парсинг аргументов командной строки ======
while getopts ":d:e:" opt; do
  case ${opt} in
    d )
      DOMAIN=$OPTARG
      ;;
    e )
      EMAIL=$OPTARG
      ;;
    \? )
      echo "Неверный флаг: -$OPTARG" 1>&2
      usage
      ;;
    : )
      echo "Флаг -$OPTARG требует аргумента." 1>&2
      usage
      ;;
  esac
done

# Проверка, что все обязательные параметры были переданы
if [ -z "${DOMAIN}" ] || [ -z "${EMAIL}" ]; then
    echo "Ошибка: не все обязательные параметры были указаны."
    usage
fi

# ====== Настройки из параметров ======
PROJECT_DIR="/var/www/$DOMAIN"       # Путь до проекта теперь динамический
GIT_REPO="https://github.com/lgick/VIMP-Tank-Battle.git"  # Репозиторий проекта
NGINX_TEMPLATE_URL="https://raw.githubusercontent.com/lgick/VIMP-Tank-Battle/master/nginx/nginx.conf" # URL к шаблону

echo "================================================="
echo "Настройка для домена: $DOMAIN"
echo "Email для SSL: $EMAIL"
echo "Директория проекта: $PROJECT_DIR"
echo "================================================="
sleep 3

# ====== Обновление системы ======
echo "Обновление системы..."
sudo apt update
sudo apt upgrade -y

# ====== Установка Nginx, Brotli и Git ======
echo "Установка Nginx, Brotli и Git..."
sudo apt install -y nginx-full libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static git curl certbot python3-certbot-nginx

# ====== Установка Node.js 22 ======
echo "Установка Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g npm@latest

# ====== Настройка проекта ======
echo "Настройка проекта..."
sudo mkdir -p "$PROJECT_DIR"

# Устанавливаем права, чтобы можно было работать без sudo внутри папки
sudo chown -R $USER:$USER "$PROJECT_DIR"
cd "$PROJECT_DIR"

if [ ! -d ".git" ]; then
    git clone "$GIT_REPO" .
else
    echo "Репозиторий уже клонирован, обновляем..."
    git pull
fi

npm install

# Динамически обновляем скрипт "start" в package.json
echo "Обновление start-скрипта в package.json..."
npm pkg set scripts.start="NODE_ENV=production node src/server/main.js --domain=$DOMAIN"

npm run build

# ====== Установка и настройка pm2 ======
echo "Установка pm2..."
sudo npm install -g pm2@latest

# Проверка, существует ли уже vimp-game
if pm2 describe vimp-game > /dev/null 2>&1; then
  echo "Приложение vimp-game уже существует, обновляем его без простоя..."
  pm2 reload vimp-game
else
  echo "Приложение vimp-game не найдено, запускаем впервые..."
  pm2 start npm --name vimp-game -- run start
fi

pm2 save

# Настройка автозапуска pm2 для systemd
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# ====== Получение SSL-сертификата ======
echo "Получение SSL..."
sudo certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

# ====== Настройка Nginx ======
echo "Настройка Nginx..."
NGINX_CONF_PATH="/etc/nginx/sites-available/$DOMAIN.conf"
sudo rm -f /etc/nginx/sites-enabled/default
sudo curl -o "$NGINX_CONF_PATH" "$NGINX_TEMPLATE_URL"
# Заменяем плейсхолдер __DOMAIN__ на реальный домен
sudo sed -i "s/__DOMAIN__/$DOMAIN/g" "$NGINX_CONF_PATH"
sudo ln -sf "$NGINX_CONF_PATH" "/etc/nginx/sites-enabled/"
sudo nginx -t
sudo systemctl restart nginx

# ====== Настройка брандмауэра ======
echo "Настройка UFW..."
echo "y" | sudo ufw enable
sudo ufw allow 'OpenSSH'
sudo ufw allow 'Nginx Full'

# ====== Установка конфигурации Vim ======
echo "Установка конфигурации Vim..."
curl -o ~/.vimrc https://raw.githubusercontent.com/lgick/config/refs/heads/master/.vimrc

echo "Готово! Сервер настроен для домена $DOMAIN."
