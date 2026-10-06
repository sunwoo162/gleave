#!/usr/bin/env bash
set -Eeuo pipefail

deploy_root="${1:?deployment root is required}"
release_id="${2:?release id is required}"
archive_path="${3:?archive path is required}"
app_port="${4:-3000}"

release_dir="${deploy_root}/releases/${release_id}"
current_link="${deploy_root}/current"
runtime_config="${deploy_root}/iseol-runtime.json"

mkdir -p "${deploy_root}/releases" "${deploy_root}/incoming" "${deploy_root}/data"
rm -rf "${release_dir}"
mkdir -p "${release_dir}"
tar -xzf "${archive_path}" -C "${release_dir}"

if [[ ! -f "${deploy_root}/.env" ]]; then
  cp "${release_dir}/.env.example" "${deploy_root}/.env"
fi

if [[ ! -f "${runtime_config}" ]]; then
  (
    cd "${release_dir}"
    npm run setup:self-hosted -- --data-root "${deploy_root}/data"
  )
  mv "${release_dir}/iseol-runtime.json" "${runtime_config}"
fi

# dotenv/config resolves from the release cwd; keep credentials outside versioned releases.
rm -f "${release_dir}/.env"
ln -s "${deploy_root}/.env" "${release_dir}/.env"

cd "${release_dir}"
npm ci --omit=optional
ln -sfn "${release_dir}" "${current_link}"

export ISEOL_RELEASE_DIR="${current_link}"
export ISEOL_RUNTIME_CONFIG="${runtime_config}"
export ISEOL_WEB_HOST="127.0.0.1"
export ISEOL_WEB_PORT="${app_port}"
pm2 startOrReload "${current_link}/ecosystem.config.cjs" --only iseol-web --update-env
pm2 save

for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${app_port}/healthz" >/dev/null; then
    printf 'SSH deployment health check passed: %s\n' "${release_id}"
    exit 0
  fi
  sleep 2
done

printf 'SSH deployment health check failed: %s\n' "${release_id}" >&2
pm2 logs iseol-web --lines 80 --nostream >&2 || true
exit 1
