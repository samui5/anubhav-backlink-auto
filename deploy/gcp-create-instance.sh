#!/usr/bin/env bash
set -euo pipefail

# Creates a GCP e2-micro VM that is free under the Always Free tier and
# fully self-configuring: its startup-script installs Docker, clones this
# repo, builds the automate-backlink image, and registers a systemd timer
# that runs it on a recurring schedule — no manual steps needed on the VM
# itself once this script returns.
#
# Always Free covers exactly ONE e2-micro instance per month, and only in
# us-west1, us-central1, or us-east1 (this script defaults to
# us-central1-a) — plus up to 30GB-month of standard persistent disk and
# 1GB/day of North-America egress. Stay within those (this script does by
# default) and the VM costs nothing; go outside them (another instance,
# another region, a bigger disk) and normal billing applies.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: `gcloud init`
#   - A GCP project with billing enabled (required to create any VM, even
#     an Always Free one — nothing is actually charged while within the
#     limits above)
#   - This project pushed to a git repo the VM can clone (a public GitHub
#     repo is the simplest — same repo the GitHub Actions workflow uses)
#   - `deploy/startup-script.sh` — do not move it relative to this file
#
# Usage:
#   REPO_URL=https://github.com/<you>/automate-backlink.git \
#     ./deploy/gcp-create-instance.sh
#
# Every variable below can also be set as an env var before running this
# script; anything left unset falls back to the default shown.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${ZONE:-us-central1-a}"                    # us-central1 / us-west1 / us-east1 ONLY for Always Free
INSTANCE_NAME="${INSTANCE_NAME:-automate-backlink}"
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/automate-backlink.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
# Comma-separated; one is picked at random per site attempt (see
# config/settings.js -> pickTargetUrl). Leave unset to use the built-in
# default list there. Set to a single URL to force every submission to
# that one link instead.
TARGET_URLS="${TARGET_URLS:-}"
PING_KEYWORDS="${PING_KEYWORDS:-sap btp training,sap cap training,sap rap training,sap gen ai course}"
# systemd OnCalendar expression: e.g. daily, weekly, hourly, or
# "*-*-* 03:00:00" for 3am every day. See `man systemd.time`.
RUN_SCHEDULE="${RUN_SCHEDULE:-daily}"
# Opera is skipped by default: e2-micro only has 1GB RAM, and Opera has
# shown intermittent crash-loop behavior under constrained/virtualized
# environments in this project's own Docker testing (see Dockerfile and
# src/browsers.js) — Chrome + Firefox are the two verified reliable in
# Docker. Add "opera" here at your own risk / after testing it yourself.
RUN_BROWSERS="${RUN_BROWSERS:-chrome,firefox}"

if [ "$REPO_URL" = "https://github.com/YOUR_USERNAME/automate-backlink.git" ]; then
  echo "Set REPO_URL to your actual git remote first (see the top of this script), e.g.:" >&2
  echo "  REPO_URL=https://github.com/you/automate-backlink.git $0" >&2
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "No GCP project set. Run 'gcloud config set project <id>' or pass PROJECT_ID=<id>." >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/startup-script.sh" ]; then
  echo "Expected $SCRIPT_DIR/startup-script.sh — don't move this script relative to it." >&2
  exit 1
fi

echo "Project:      $PROJECT_ID"
echo "Zone:         $ZONE  (must be us-central1-*/us-west1-*/us-east1-* to stay free)"
echo "Instance:     $INSTANCE_NAME (e2-micro, 30GB pd-standard)"
echo "Repo:         $REPO_URL @ $REPO_BRANCH"
echo "Target URLs:  ${TARGET_URLS:-(default list in config/settings.js)}"
echo "Schedule:     $RUN_SCHEDULE"
echo "Browsers:     $RUN_BROWSERS"
echo

gcloud compute instances create "$INSTANCE_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --metadata="^;^repo-url=${REPO_URL};repo-branch=${REPO_BRANCH};target-urls=${TARGET_URLS};ping-keywords=${PING_KEYWORDS};run-schedule=${RUN_SCHEDULE};run-browsers=${RUN_BROWSERS}" \
  --metadata-from-file=startup-script="$SCRIPT_DIR/startup-script.sh"

cat <<EOF

Created. First boot takes a few minutes — installing Docker, cloning the
repo, building the image, and registering the systemd timer, all via the
startup-script. Watch that with:

  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo journalctl -u google-startup-scripts -f'

Once set up, the run itself fires immediately and then on the '$RUN_SCHEDULE'
schedule. Check on it with:

  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo systemctl status automate-backlink.timer'
  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo journalctl -u automate-backlink -f'
  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='ls -la /opt/automate-backlink/logs'

To pull a report back to your machine:

  gcloud compute scp --zone=$ZONE --recurse $INSTANCE_NAME:/opt/automate-backlink/logs ./gcp-logs

To change the target URL / keywords / schedule later, SSH in, edit
/etc/automate-backlink.env (target/keywords) or
/etc/systemd/system/automate-backlink.timer (schedule, then
'sudo systemctl daemon-reload && sudo systemctl restart automate-backlink.timer').

To tear it down (stop being billed for it entirely, e.g. if you're done or
want to stay clear of the free-tier limits for any reason):

  ./deploy/gcp-teardown.sh
EOF
