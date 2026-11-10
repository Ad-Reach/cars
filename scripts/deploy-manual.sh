#!/usr/bin/env bash
# Ручной деплой на прод — те же шаги, что в .github/workflows/deploy.yml и deploy-cms.yml.
# Нужен, когда GitHub Actions недоступен.
#
# Запуск из корня репозитория (с машины, где есть SSH-ключ пользователя rangauto):
#   DEPLOY_HOST=<адрес сервера> scripts/deploy-manual.sh          # сайт + CMS
#   DEPLOY_HOST=<адрес сервера> scripts/deploy-manual.sh site     # только сайт
#   DEPLOY_HOST=<адрес сервера> scripts/deploy-manual.sh cms      # только CMS
#
# Деплоится текущее состояние ветки production из origin.
set -euo pipefail

: "${DEPLOY_HOST:?Укажите DEPLOY_HOST (адрес сервера)}"
TARGET="${1:-all}"
SSH_USER="${SSH_USER:-rangauto}"
REMOTE="$SSH_USER@$DEPLOY_HOST"

ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

git -C "$ROOT" fetch origin production
git -C "$ROOT" worktree add --detach "$WORK/src" origin/production
SRC="$WORK/src"
REL="$(git -C "$SRC" rev-parse HEAD)"
echo "Релиз: $REL"

deploy_site() {
  echo "== Сайт: сборка"
  cd "$SRC"
  npm ci
  CMS_URL=https://rangauto.ru/cms CMS_PUBLIC_URL=https://rangauto.ru/cms npx next build

  rm -rf "$WORK/release" && mkdir -p "$WORK/release/.next"
  cp -r .next/standalone/. "$WORK/release/"
  cp -r .next/static "$WORK/release/.next/static"
  cp -r public "$WORK/release/public"

  echo "== Сайт: загрузка и переключение"
  rsync -az --delete "$WORK/release/" "$REMOTE:/srv/rangauto/releases/$REL/"
  ssh "$REMOTE" "set -e
    cd /srv/rangauto
    ln -sfn releases/$REL current.tmp && mv -Tf current.tmp current
    date -u +%FT%TZ > deployed
    ls -1dt releases/* | tail -n +6 | xargs -r rm -rf
  "

  echo "== Сайт: проверка"
  for _ in $(seq 1 20); do
    code=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/" || true)
    [ "$code" = "200" ] && echo "Сайт OK" && return 0
    sleep 3
  done
  echo "Сайт не ответил 200 после деплоя" >&2; return 1
}

deploy_cms() {
  echo "== CMS: сборка"
  cd "$SRC/cms"
  npm ci
  NODE_ENV=production PUBLIC_URL=https://rangauto.ru/cms ADMIN_COOKIE_PATH=/cms/admin npm run build
  npm prune --omit=dev

  rm -rf "$WORK/cms-release" && mkdir -p "$WORK/cms-release/public"
  cp -r dist node_modules package.json tsconfig.json favicon.png seed "$WORK/cms-release/"
  cp public/robots.txt "$WORK/cms-release/public/"

  if ! ssh "$REMOTE" "test -d /srv/rangauto/cms/releases"; then
    echo "Сервер не настроен для CMS: выполните cms/deploy/server-setup.sh от root" >&2; return 1
  fi

  echo "== CMS: загрузка и переключение"
  rsync -az --delete --link-dest=/srv/rangauto/cms/current/ "$WORK/cms-release/" "$REMOTE:/srv/rangauto/cms/releases/$REL/"
  ssh "$REMOTE" "set -e
    cd /srv/rangauto/cms
    ln -sfn /srv/rangauto/cms/uploads releases/$REL/public/uploads
    ln -sfn releases/$REL current.tmp && mv -Tf current.tmp current
    date -u +%FT%TZ > deployed
    ls -1dt releases/* | tail -n +4 | xargs -r rm -rf
  "

  echo "== CMS: проверка"
  for _ in $(seq 1 40); do
    code=$(ssh "$REMOTE" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:1337/_health" || true)
    [ "$code" = "204" ] && echo "CMS OK" && return 0
    sleep 5
  done
  echo "CMS не ответила после деплоя" >&2; return 1
}

case "$TARGET" in
  site) deploy_site ;;
  cms)  deploy_cms ;;
  all)  deploy_site; deploy_cms ;;
  *) echo "Использование: $0 [site|cms|all]" >&2; exit 2 ;;
esac
