#!/usr/bin/env bash
set -euo pipefail

# Deletes the VM created by gcp-create-instance.sh. There's no cost reason
# to do this while you're staying within the Always Free limits (the
# instance is free to leave running 24/7), but it's here for whenever you
# want it gone — done with the project, changing regions, cleaning up a
# test, etc.

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-us-central1-a}"
INSTANCE_NAME="${INSTANCE_NAME:-automate-backlink}"

if [ -z "$PROJECT_ID" ]; then
  echo "No GCP project set. Run 'gcloud config set project <id>' or pass PROJECT_ID=<id>." >&2
  exit 1
fi

echo "This will permanently delete instance '$INSTANCE_NAME' in zone '$ZONE' (project $PROJECT_ID),"
echo "including its boot disk and every unpulled report under /opt/automate-backlink/logs."
read -r -p "Type the instance name to confirm: " CONFIRM
if [ "$CONFIRM" != "$INSTANCE_NAME" ]; then
  echo "Confirmation did not match — aborted." >&2
  exit 1
fi

gcloud compute instances delete "$INSTANCE_NAME" --project="$PROJECT_ID" --zone="$ZONE" --quiet
