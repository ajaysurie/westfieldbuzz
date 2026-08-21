#!/usr/bin/env bash
# Deploy the composite indexes in firestore.indexes.json via gcloud.
#
# The Firebase CLI is the normal route (`firebase deploy --only firestore:indexes`,
# already configured in firebase.json). This script exists because that CLI can get
# stuck in a reauth loop. gcloud reaches the same Firestore Admin API.
#
# Usage:
#   ./scripts/deploy-indexes-gcloud.sh westfieldbuzz-dev
#   ./scripts/deploy-indexes-gcloud.sh westfieldbuzz-prod
#
# Creating an index that already exists returns ALREADY_EXISTS, which this treats
# as success, so re-running is safe.

set -uo pipefail

DB="${1:-}"
PROJECT="westfieldbuzz"

if [ -z "$DB" ]; then
  echo "usage: $0 <westfieldbuzz-dev|westfieldbuzz-prod>" >&2
  exit 1
fi

echo "Project:  $PROJECT"
echo "Database: $DB"
echo "Account:  $(gcloud config get-value account 2>/dev/null)"
echo

# Fail early and clearly if the active account cannot see the project, which is
# the failure this whole detour exists to work around.
if ! gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1; then
  echo "ERROR: the active gcloud account cannot access project '$PROJECT'." >&2
  echo "Run 'gcloud auth login' with the account that owns the Firebase project," >&2
  echo "then 'gcloud config set account <that-account>' and re-run." >&2
  exit 1
fi

created=0
existed=0
failed=0

create_index() {
  local label="$1"; shift
  echo "--- $label"
  local out
  out="$(gcloud firestore indexes composite create \
    --collection-group=events \
    --database="$DB" \
    --project="$PROJECT" \
    "$@" 2>&1)"
  local rc=$?
  if [ $rc -eq 0 ]; then
    echo "    created"
    created=$((created + 1))
  elif echo "$out" | grep -qi "already exists"; then
    echo "    already exists"
    existed=$((existed + 1))
  else
    echo "    FAILED: $(echo "$out" | tail -3)"
    failed=$((failed + 1))
  fi
}

create_index "events(category, date)" \
  --field-config=field-path=category,order=ascending \
  --field-config=field-path=date,order=ascending

create_index "events(publicationStatus, date)" \
  --field-config=field-path=publicationStatus,order=ascending \
  --field-config=field-path=date,order=ascending

create_index "events(publicationStatus, freshnessStatus, date)" \
  --field-config=field-path=publicationStatus,order=ascending \
  --field-config=field-path=freshnessStatus,order=ascending \
  --field-config=field-path=date,order=ascending

create_index "events(publicationStatus, category, date)" \
  --field-config=field-path=publicationStatus,order=ascending \
  --field-config=field-path=category,order=ascending \
  --field-config=field-path=date,order=ascending

echo
echo "created=$created already-existed=$existed failed=$failed"
echo "Indexes build in the background. Check status with:"
echo "  gcloud firestore indexes composite list --database=$DB --project=$PROJECT"
[ $failed -eq 0 ] || exit 1
