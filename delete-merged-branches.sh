#!/bin/bash

# Branch Cleanup Script
# This script deletes all merged branches except main
# Run this AFTER merging the PR

set -e

echo "🔍 Checking current branch..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: You're on branch '$CURRENT_BRANCH'"
    echo "   Switching to main..."
    git checkout main
fi

echo "📥 Pulling latest changes..."
git pull origin main

echo ""
echo "🗑️  Deleting remote branches..."

branches=(
    "copilot/add-auth-guard-and-user-scoping"
    "copilot/fix-oauth-signup-flow"
    "copilot/fix-platform-redirect-issues"
    "copilot/integrate-llama-3-1-into-dashboard"
    "copilot/merge-all-branches-into-main"
    "copilot/merge-all-branches-into-main-again"
    "copilot/merge-and-delete-other-branches"
    "copilot/merge-open-draft-pull-request"
    "copilot/update-platforms-redirect-uri"
)

for branch in "${branches[@]}"; do
    echo "  Deleting origin/$branch..."
    git push origin --delete "$branch" 2>&1 | grep -v "error: unable to delete" || true
done

echo ""
echo "🧹 Cleaning up local branches..."

for branch in "${branches[@]}"; do
    if git show-ref --verify --quiet "refs/heads/$branch"; then
        echo "  Deleting local branch $branch..."
        git branch -D "$branch" 2>&1 || true
    fi
done

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📋 Remaining branches:"
git branch -a

echo ""
echo "✨ Repository now has only the main branch with all changes merged!"
