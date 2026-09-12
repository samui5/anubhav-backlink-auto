#!/usr/bin/env bash
# Runs as root on every boot of the GCE instance (GCE re-runs
# startup-script on every restart, not just the first). Guarded to be
# idempotent: the one-time setup (swap, Docker, clone, build, systemd
# units) only happens once; every boot still makes sure Docker and the
# timer are enabled.
set -euo pipefail

MARKER=/opt/automate-backlink/.setup-complete
LOG=/var/log/automate-backlink-setup.log
exec >>"$LOG" 2>&1
echo "=== startup-script run at $(date -u) ==="

meta() {
  curl -s -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1"
}

REPO_URL="$(meta repo-url)"
REPO_BRANCH="$(meta repo-branch)"
TARGET_URLS="$(meta target-urls)"
PING_KEYWORDS="$(meta ping-keywords)"
RUN_SCHEDULE="$(meta run-schedule)"
RUN_BROWSERS="$(meta run-browsers)"

if [ ! -f "$MARKER" ]; then
  echo "--- first-time setup ---"

  # e2-micro has only 1GB RAM; a 2GB swapfile gives headless Chromium/
  # Firefox and the Docker build itself room to breathe without the OOM
  # killer stepping in.
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  apt-get update
  apt-get install -y ca-certificates curl gnupg git

  # Official Docker install (docker.com's documented apt method).
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io
  systemctl enable --now docker

  git clone --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" /opt/automate-backlink
  mkdir -p /opt/automate-backlink/logs

  touch "$MARKER"
  echo "--- first-time setup done ---"
else
  echo "--- already set up, pulling latest and rebuilding ---"
  cd /opt/automate-backlink
  git fetch origin "$REPO_BRANCH"
  git reset --hard "origin/$REPO_BRANCH"
fi

systemctl enable --now docker
docker build -t automate-backlink /opt/automate-backlink

# /etc/automate-backlink.env is read fresh by the systemd service on every
# run — edit it by hand later (then just wait for the next scheduled tick,
# no restart needed) to change the target URL or keywords without
# re-running this whole script.
if [ ! -f /etc/automate-backlink.env ]; then
  cat > /etc/automate-backlink.env <<EOF
TARGET_URLS=${TARGET_URLS}
PING_KEYWORDS=${PING_KEYWORDS}
RUN_BROWSERS=${RUN_BROWSERS}
# Report email (config/settings.js -> email / src/mailer.js). EMAIL_FROM
# and EMAIL_TO default correctly in settings.js if left unset. Deliberately
# NOT sourced from instance metadata (metadata is visible to anyone with
# viewer access to the project) -- SSH in and set GMAIL_APP_PASSWORD here
# by hand, then just wait for the next scheduled tick:
#   gcloud compute ssh <instance> --zone=<zone> --command='sudo nano /etc/automate-backlink.env'
# Generate the app password at https://myaccount.google.com/apppasswords
# (requires 2-Step Verification on the sending Gmail account).
GMAIL_APP_PASSWORD=
EOF
fi

cat > /etc/systemd/system/automate-backlink.service <<'EOF'
[Unit]
Description=automate-backlink run
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
EnvironmentFile=/etc/automate-backlink.env
ExecStart=/bin/sh -c '/usr/bin/docker run --rm --env-file /etc/automate-backlink.env -v /opt/automate-backlink/logs:/app/logs automate-backlink --only=$RUN_BROWSERS'
EOF

# RUN_SCHEDULE is baked in here (unlike the .env above, systemd timer
# files don't get re-read per-run the same way) — edit this file directly
# and `systemctl daemon-reload && systemctl restart automate-backlink.timer`
# to change the schedule later.
cat > /etc/systemd/system/automate-backlink.timer <<EOF
[Unit]
Description=Run automate-backlink on a schedule

[Timer]
OnCalendar=${RUN_SCHEDULE}
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now automate-backlink.timer
# Kick off an immediate run too, rather than waiting for the first
# scheduled tick — --no-block so this startup-script (and GCE's boot
# sequence) doesn't sit blocked for however long the run itself takes.
systemctl start --no-block automate-backlink.service

echo "=== startup-script finished at $(date -u) ==="
