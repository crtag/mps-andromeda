# Release Notes

## User Tracking and Tag Editing

**Added:**
- Jobs now track which user submitted them
- "User" column in results table shows submitter's email
- User email displayed on job cards in job list view
- Advanced tag filtering with AND/OR/NOT logic (default: AND, +: OR, -: NOT)
- Ability to edit tags after job creation (from job cards)
- Delete button now available for failed jobs
- Friendly display labels for output files (XYZ, JSON, LOG, OUT, TRAJECTORY, DATASET, etc.)
- Dataset folder support - displays last optimization frame as DATASET link
- Download zip files named as: [xyz-filename]_[job-id].zip

**Improved:**
- Table filters now exclude rows with empty values
- Fixed table button functionality issue

**Notes:**
- Existing jobs will show empty user field
