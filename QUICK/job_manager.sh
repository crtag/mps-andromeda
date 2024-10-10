#!/bin/bash

# Define API endpoints
JOB_ASSIGNMENT_ENDPOINT="${API_URL_JOB_ASSIGNMENT}"
# STATUS_REPORT_ENDPOINT="${API_URL_STATUS_REPORT}"

# Directory for shared data
SHARED_DIR="${SHARED_DIR}"
LOG_FILE="$SHARED_DIR/job_manager.log"

# Logging function
log_message() {
    local message="$1"
    local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

# Function to report status
# report_status() {
#     for output_file in "$SHARED_DIR"/*.out; do
#         if [[ -f "$output_file" ]]; then
#             # Send the output file incrementally
#             curl -X POST -F "file=@${output_file}" $STATUS_REPORT_ENDPOINT
#         fi
#     done
# }

# Function to request a new job
fetch_new_job() {
    # Request a new job from the API and capture response code and body
    response=$(curl -s -w "\n%{http_code}" -X GET "$JOB_ASSIGNMENT_ENDPOINT")
    http_code=$(echo "$response" | tail -n1)
    response=$(echo "$response" | head -n -1)

    # Check the response for new job information
    if [[ "$http_code" == "200" && "$response" != "" ]]; then
        file_name=$(echo "$response" | head -n 1)
        job_spec=$(echo "$response" | tail -n +2)
        total_lines=$(echo "$job_spec" | wc -l)

        log_message "New job received: $file_name"
        log_message "There were $total_lines lines total in the job spec"
        
        # Write the input parameters to a new .in file
        input_file="$SHARED_DIR/$file_name"
        echo "$job_spec" > "$input_file"

        # start the execution of the job
        log_message "Starting job execution"
        mpirun --allow-run-as-root -np 1 quick.cuda.MPI "$input_file" >> "$LOG_FILE" 2>&1 &
    else
        log_message "No new jobs available or failed to fetch job (HTTP code: $http_code, response: $response)"
    fi
}

# Main loop to manage job and status reporting
main_loop() {
    while true; do
        # Check if QUICK is running
        if pgrep -x "quick" > /dev/null; then
            echo "QUICK is running"
            # report_status
        else
            echo "QUICK is not running, fetching new job..."
            fetch_new_job
        fi
        # Sleep before the next cycle
        sleep 60
    done
}

# Wrapper to restart script in case of failure
while true; do
    main_loop
    log_message "Script crashed. Restarting in 5 seconds..."
    sleep 5
done
