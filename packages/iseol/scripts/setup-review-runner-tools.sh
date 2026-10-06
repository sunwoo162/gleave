#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-check}"
TOOLS_HOME="${ISEOL_REVIEW_TOOLS_HOME:-$HOME/.local/share/iseol-review-tools}"
BIN_DIR="${ISEOL_REVIEW_BIN_DIR:-$HOME/.local/bin}"
GO_HOME="$TOOLS_HOME/go"
mkdir -p "$TOOLS_HOME" "$BIN_DIR"

log() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

require_base() {
  local failed=0
  for command in node npm git curl tar; do
    if have "$command"; then
      log "✅ $command: $(command -v "$command")"
    else
      log "❌ $command: missing"
      failed=1
    fi
  done
  return "$failed"
}

install_node_tools() {
  log "== Node analyzers =="
  npm install --prefix "$TOOLS_HOME/node" --no-audit --no-fund knip dependency-cruiser
  for tool in knip depcruise; do
    local source="$TOOLS_HOME/node/node_modules/.bin/$tool"
    if [[ -x "$source" ]]; then ln -sfn "$source" "$BIN_DIR/$tool"; fi
  done
}

install_semgrep() {
  log "== Semgrep =="
  if ! have python3; then log "⚠️ python3 없음 · semgrep 설치 건너뜀"; return; fi
  if ! python3 -m venv --help >/dev/null 2>&1; then
    log "⚠️ python3-venv 없음 · semgrep 설치 건너뜀 (Ubuntu: sudo apt install python3-venv)"
    return
  fi
  python3 -m venv "$TOOLS_HOME/semgrep-venv"
  "$TOOLS_HOME/semgrep-venv/bin/pip" install --upgrade pip semgrep
  ln -sfn "$TOOLS_HOME/semgrep-venv/bin/semgrep" "$BIN_DIR/semgrep"
}

install_go_runtime() {
  log "== Go runtime for security analyzers =="
  local os arch version archive
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) log "⚠️ 지원하지 않는 CPU 아키텍처: $(uname -m)"; return 1 ;;
  esac
  if [[ "$os" != "linux" ]]; then
    log "⚠️ 자동 Go 설치는 Linux runner만 지원합니다: $os"
    return 1
  fi

  version="$(curl -fsSL 'https://go.dev/VERSION?m=text' | head -n 1)"
  if [[ ! "$version" =~ ^go[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
    log "⚠️ 최신 Go 버전을 확인하지 못했습니다: $version"
    return 1
  fi

  archive="$TOOLS_HOME/${version}.${os}-${arch}.tar.gz"
  log "Go runtime: $version ($os/$arch)"
  curl -fsSL "https://go.dev/dl/${version}.${os}-${arch}.tar.gz" -o "$archive"
  rm -rf "$GO_HOME"
  tar -C "$TOOLS_HOME" -xzf "$archive"
  rm -f "$archive"
  export PATH="$GO_HOME/bin:$BIN_DIR:$PATH"
  log "✅ go: $($GO_HOME/bin/go version)"
}

install_go_tools() {
  log "== Go security analyzers =="
  if ! install_go_runtime; then
    log "⚠️ Go runtime 준비 실패 · gitleaks/trivy/osv-scanner/actionlint 설치 건너뜀"
    return
  fi
  GOBIN="$BIN_DIR" go install github.com/gitleaks/gitleaks/v8@latest
  GOBIN="$BIN_DIR" go install github.com/aquasecurity/trivy/cmd/trivy@latest
  GOBIN="$BIN_DIR" go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest
  GOBIN="$BIN_DIR" go install github.com/rhysd/actionlint/cmd/actionlint@latest
}

report() {
  log "== Iseol review analyzer status =="
  for tool in node npm git curl go knip depcruise semgrep gitleaks trivy osv-scanner actionlint; do
    if have "$tool"; then
      local version
      version="$($tool --version 2>/dev/null | head -1 || true)"
      log "✅ $tool ${version:+· $version}"
    else
      log "⚪ $tool · not installed (collector records this analyzer as skipped)"
    fi
  done
  log "PATH must include: $BIN_DIR"
  log "Go runtime path when installed by this helper: $GO_HOME/bin"
}

require_base || {
  log "필수 도구가 없어 runner analyzer 설치를 계속할 수 없습니다."
  exit 1
}

case "$MODE" in
  install)
    install_node_tools
    install_semgrep
    install_go_tools
    ;;
  check)
    ;;
  *)
    echo "usage: $0 [check|install]" >&2
    exit 2
    ;;
esac

export PATH="$GO_HOME/bin:$BIN_DIR:$PATH"
report
