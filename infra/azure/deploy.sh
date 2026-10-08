#!/usr/bin/env bash
# Deploys DRIFT to Azure Container Apps (ADR-0009), in the order Fly's release command used to give us:
#   1. the logs, the environment and the migration job, with the new image;
#   2. the migration job, waited on: a failure stops here and the running app is untouched;
#   3. the app (web, worker, Redis sidecar) with the new image.
#
# Usage (from the repository root, signed in with `az login`):
#   infra/azure/deploy.sh <resource group> [<image tag>]
# The image tag defaults to the checked-out commit; its images must have been published first
# (.github/workflows/images.yml). docs/modules/infra.md has the first deploy step by step.
#
# Settings come from the environment, never from arguments (which other users of the machine could see):
#   required  DATABASE_URL, AUTH_SECRET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
#   optional  IMAGE_PREFIX (default ghcr.io/<repository owner>), GHCR_USERNAME + GHCR_TOKEN (private images),
#             GITHUB_ID + GITHUB_SECRET (GitHub sign-in), NAME_PREFIX (default drift)
set -euo pipefail

if [ $# -lt 1 ]; then
  sed -n '2,15p' "$0" >&2
  exit 2
fi
resource_group=$1
image_tag=${2:-$(git rev-parse HEAD)}
here=$(cd "$(dirname "$0")" && pwd)

for name in DATABASE_URL AUTH_SECRET S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  if [ -z "${!name:-}" ]; then
    echo "$name is not set (see docs/modules/infra.md)" >&2
    exit 2
  fi
done
if [ -z "${IMAGE_PREFIX:-}" ]; then
  owner=$(git remote get-url origin | sed -E 's#^.*github\.com[:/]([^/]+)/.*$#\1#' | tr '[:upper:]' '[:lower:]')
  IMAGE_PREFIX="ghcr.io/$owner"
fi
name_prefix=${NAME_PREFIX:-drift}

# The secrets go to Azure in a parameters file only this user can read, removed on exit.
params=$(mktemp)
trap 'rm -f "$params"' EXIT
chmod 600 "$params"
# A new Redis password each deploy: Redis restarts with every new revision anyway, and only its own app uses it.
REDIS_PASSWORD=$(openssl rand -hex 32) IMAGE_PREFIX=$IMAGE_PREFIX IMAGE_TAG=$image_tag NAME_PREFIX=$name_prefix \
  python3 - "$params" <<'PY'
import json, os, sys
env = os.environ
values = {
    "namePrefix": env["NAME_PREFIX"],
    "imagePrefix": env["IMAGE_PREFIX"],
    "imageTag": env["IMAGE_TAG"],
    "databaseUrl": env["DATABASE_URL"],
    "redisPassword": env["REDIS_PASSWORD"],
    "authSecret": env["AUTH_SECRET"],
    "s3Endpoint": env["S3_ENDPOINT"],
    "s3AccessKeyId": env["S3_ACCESS_KEY_ID"],
    "s3SecretAccessKey": env["S3_SECRET_ACCESS_KEY"],
    "registryUsername": env.get("GHCR_USERNAME", ""),
    "registryPassword": env.get("GHCR_TOKEN", ""),
    "githubId": env.get("GITHUB_ID", ""),
    "githubSecret": env.get("GITHUB_SECRET", ""),
}
document = {
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {name: {"value": value} for name, value in values.items()},
}
with open(sys.argv[1], "w") as handle:
    json.dump(document, handle)
PY

deploy() {
  az deployment group create \
    --resource-group "$resource_group" \
    --name "drift-$1-$(date -u +%Y%m%dT%H%M%S)" \
    --template-file "$here/main.bicep" \
    --parameters "@$params" \
    --parameters deployApp="$2" \
    --query properties.outputs --output json
}

echo "1/3  environment and migration job, image $IMAGE_PREFIX/drift-platform:$image_tag"
deploy setup false > /dev/null

job="$name_prefix-migrate"
echo "2/3  migrations ($job)"
execution=$(az containerapp job start --name "$job" --resource-group "$resource_group" --query name --output tsv)
status=Running
for _ in $(seq 1 120); do
  sleep 5
  status=$(az containerapp job execution show --name "$job" --resource-group "$resource_group" \
    --job-execution-name "$execution" --query properties.status --output tsv)
  case "$status" in
    Succeeded) break ;;
    Failed | Degraded | Stopped)
      echo "The migrations ended as $status. Nothing was rolled out. Logs:" >&2
      echo "  az containerapp job logs show --name $job --resource-group $resource_group --execution $execution --container migrate" >&2
      exit 1
      ;;
  esac
done
if [ "$status" != Succeeded ]; then
  echo "The migrations did not finish within 10 minutes (last status: $status). Nothing was rolled out." >&2
  exit 1
fi

echo "3/3  app (web, worker, Redis)"
url=$(deploy app true | python3 -c 'import json, sys; print(json.load(sys.stdin)["url"]["value"])')
echo "Deployed: $url"
for _ in $(seq 1 36); do
  if curl --silent --fail --max-time 10 "$url/healthz" > /dev/null; then
    echo "$url/healthz answers. Check the dependencies with: curl $url/readyz"
    exit 0
  fi
  sleep 5
done
echo "$url/healthz did not answer within 3 minutes. Logs:" >&2
echo "  az containerapp logs show --name $name_prefix --resource-group $resource_group --container web --tail 100" >&2
exit 1
