#!/bin/bash
set -e

SOURCE="staging"
TARGET="main"

echo "Promoting $SOURCE → $TARGET"

# Fetch latest changes
git fetch origin

# Checkout target and create a backup
git checkout $TARGET
BACKUP_BRANCH="${TARGET}-backup-$(date +%Y%m%d%H%M%S)"
git checkout -b $BACKUP_BRANCH
git push origin $BACKUP_BRANCH
echo "Backup created: $BACKUP_BRANCH"

# Create new target from source
git checkout $SOURCE
NEW_BRANCH="new-$TARGET"
git checkout -b $NEW_BRANCH

# Force push
git push --force origin $NEW_BRANCH:$TARGET

# Cleanup
git checkout $SOURCE
git branch -D $NEW_BRANCH

echo "Successfully promoted $SOURCE → $TARGET"
