# Job Results Archiving

Completed job results are automatically archived using GCP Storage Transfer Service.

## Configuration

| Setting | Value |
|---------|-------|
| **Source bucket** | `simulations-26-prod.firebasestorage.app` |
| **Source prefix** | `job-results/` |
| **Destination bucket** | `simulations-26-prod-archive` |
| **Schedule** | Daily at 1:00 PM UTC+13 |
| **Age filter** | Objects older than 14 days |
| **When to overwrite** | If different |
| **When to delete source** | Delete from source after transfer |

## Behavior

- Runs daily and copies job result folders older than 14 days to the archive bucket
- Original files deleted once successfully copied
- Folder structure is preserved: `job-results/job-123/` → `job-results/job-123/`

## Managing the Transfer Job

### View in GCP Console

```
GCP Console → Data Transfer → Storage Transfer Service
Job: transferJobs/14119565078518448809
```

### Modify Schedule or Filters

1. Go to the transfer job in GCP Console
2. Click **Configuration** tab
3. Click the pencil icon next to the setting you want to change

## Archive Bucket Details

| Setting | Value |
|---------|-------|
| **Name** | `simulations-26-prod-archive` |
| **Storage class** | Standard |
| **Location** | Same region as source |

## Restoring Archived Data

To restore files from archive:

```bash
# Copy specific job folder back to source
gsutil -m cp -r gs://simulations-26-prod-archive/job-results/JOB_FOLDER/ \
  gs://simulations-26-prod.firebasestorage.app/job-results/
```
