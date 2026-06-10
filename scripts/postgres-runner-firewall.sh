#!/usr/bin/env bash
# Open/close a temporary Postgres flexible-server firewall rule for CI migration runners.
# Azure CLI 2.87+ uses --server-name (server) and --name (rule). Older CLIs used --name
# for the server only and break either way — upgrade before firewall commands.
set -euo pipefail

ensure_az_cli() {
  if az postgres flexible-server firewall-rule create --help 2>&1 | grep -q '\-\-server-name'; then
    return 0
  fi
  echo "Azure CLI is missing postgres firewall --server-name; upgrading..."
  az upgrade --yes
}

open_rule() {
  local rg="$1" fqdn="$2" rule="$3" ip="$4"
  local server="${fqdn%%.*}"
  ensure_az_cli
  az postgres flexible-server firewall-rule create \
    --resource-group "$rg" \
    --server-name "$server" \
    --name "$rule" \
    --start-ip-address "$ip" \
    --end-ip-address "$ip"
}

close_rule() {
  local rg="$1" server="$2" rule="$3"
  ensure_az_cli
  az postgres flexible-server firewall-rule delete \
    --resource-group "$rg" \
    --server-name "$server" \
    --name "$rule" \
    --yes || true
}

case "${1:-}" in
  open) open_rule "$2" "$3" "$4" "$5" ;;
  close) close_rule "$2" "$3" "$4" ;;
  *)
    echo "Usage: $0 open <resource-group> <pg-fqdn> <rule-name> <ip>" >&2
    echo "       $0 close <resource-group> <pg-server-short-name> <rule-name>" >&2
    exit 1
    ;;
esac
