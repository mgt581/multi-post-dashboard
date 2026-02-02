# Branch Cleanup Guide

## Objective
Remove all branches from the repository except the `main` branch.

## Current Branches to Remove

The following branches should be deleted after this PR is merged into main:

1. `copilot/add-auth-guard-and-user-scoping`
2. `copilot/fix-404-page-error`
3. `copilot/integrate-llama-3-1-into-dashboard`
4. `copilot/merge-open-draft-pull-request`
5. `copilot/remove-all-other-branches` (this PR's branch)
6. `copilot/rollback-to-1254e73`

## Steps to Complete Cleanup

### Step 1: Merge This PR into Main
1. Review this PR (#35)
2. Merge this PR into the `main` branch
3. Verify the merge was successful

### Step 2: Delete All Feature Branches

After merging this PR into main, delete all branches listed above using one of these methods:

#### Option A: Using GitHub Web Interface
1. Go to https://github.com/mgt581/multi-post-dashboard/branches
2. Click the delete icon (trash can) next to each branch listed above
3. Confirm the deletion for each branch

#### Option B: Using GitHub CLI
```bash
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/add-auth-guard-and-user-scoping
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/fix-404-page-error
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/integrate-llama-3-1-into-dashboard
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/merge-open-draft-pull-request
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/remove-all-other-branches
gh api --method DELETE /repos/mgt581/multi-post-dashboard/git/refs/heads/copilot/rollback-to-1254e73
```

#### Option C: Using Git Command Line
```bash
git push origin --delete copilot/add-auth-guard-and-user-scoping
git push origin --delete copilot/fix-404-page-error
git push origin --delete copilot/integrate-llama-3-1-into-dashboard
git push origin --delete copilot/merge-open-draft-pull-request
git push origin --delete copilot/remove-all-other-branches
git push origin --delete copilot/rollback-to-1254e73
```

### Step 3: Verify Cleanup

After deleting all branches, verify that only `main` exists:

```bash
# List all remote branches
git ls-remote --heads origin

# Should only show:
# <commit-hash>  refs/heads/main
```

Or check on GitHub:
- Go to https://github.com/mgt581/multi-post-dashboard/branches
- Only `main` should be listed

## Expected Final State

After completing all steps:
- ✅ Only the `main` branch exists in the repository
- ✅ All feature branches have been removed
- ✅ The repository is clean and ready for new work

## Notes

- Make sure any important changes from these branches have been merged into `main` before deleting them
- Deleted branches can be restored from GitHub within 30 days if needed
- This cleanup helps maintain a clean repository structure
