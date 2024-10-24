#!/bin/bash
DEFAULT_APP_EXECUTABLE="quick.cuda.MPI"
DEFAULT_STATUS_CHECK_INTERVAL=60
DEFAULT_SHARED_DIR="/mnt/shared-disk"

# Trap SIGCHLD to ensure terminated background processes are cleaned up
trap 'wait' SIGCHLD

# Check if shared directory is set or use default
if [[ -z "${SHARED_DIR}" ]]; then
    echo "WARNING: SHARED_DIR not set, using default value $DEFAULT_SHARED_DIR"
fi

# Directory for shared data
SHARED_DIR="${SHARED_DIR:-$DEFAULT_SHARED_DIR}"

mkdir -p "${SHARED_DIR}"
mkdir -p "${SHARED_DIR}/.processed"

if [[ ! -w "${SHARED_DIR}" ]]; then
    echo "ERROR: No write permission to SHARED_DIR"
    exit 1
fi

LOG_FILE="$SHARED_DIR/job_manager.log"
OFFSET_FILE="${SHARED_DIR}/.last_offset"

# Logging function
log_message() {
    local message="$1"
    local timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

    echo "[$timestamp] $message"   # Output to console
    echo "[$timestamp] $message" >> "$LOG_FILE"  # Append to log file
}

# Add basic env var validation
if [[ -z "${API_URL_JOB_ASSIGNMENT}" || -z "${API_URL_STATUS_REPORT}" ]]; then
    log_message "ERROR: Required environment variables not set"
    exit 1
fi

# if APP_EXECUTABLE is not set, prompt that we will use the default value
if [[ -z "${APP_EXECUTABLE}" ]]; then
    log_message "WARNING: APP_EXECUTABLE not set, using default value $DEFAULT_APP_EXECUTABLE"
fi

# Executable to run with the default fallback
APP_EXECUTABLE="${APP_EXECUTABLE:-$DEFAULT_APP_EXECUTABLE}"

# Interval overridable by environment variable
STATUS_CHECK_INTERVAL="${STATUS_CHECK_INTERVAL:-$DEFAULT_STATUS_CHECK_INTERVAL}"

# Define API endpoints
JOB_ASSIGNMENT_ENDPOINT="${API_URL_JOB_ASSIGNMENT}"
STATUS_REPORT_ENDPOINT="${API_URL_STATUS_REPORT}"

# Initialize offset tracking for a new job
initialize_offset_tracking() {
    local file_key="$1"
    touch "$OFFSET_FILE"
    echo "${file_key}:0" >> "$OFFSET_FILE"
    log_message "Initialized offset tracking for $file_key"
}

# Function to report status
report_status() {
    local processed_dir="${SHARED_DIR}/.processed"
    
    # Ensure processed directory exists
    mkdir -p "$processed_dir"
    
    # For each input file check corresponding output
    for input_file in "$SHARED_DIR"/*.in; do
        if [[ ! -f "$input_file" ]]; then
            continue
        fi
        
        local base_name=$(basename "$input_file" .in)
        local output_file="${SHARED_DIR}/${base_name}.out"
        local molden_file="${SHARED_DIR}/${base_name}.molden"
        local file_key="${base_name}.out"
        
        # Initialize offset tracking if it doesn't exist for this file
        if ! grep -q "^${file_key}:" "$OFFSET_FILE" 2>/dev/null; then
            initialize_offset_tracking "$file_key"
        fi
        
        # Determine status
        local status
        if pgrep -x "$APP_EXECUTABLE" > /dev/null; then
            status="RUNNING"
        elif [[ -f "$output_file" && -s "$output_file" ]]; then
            status="ENDED"
        else
            status="FAILED"
        fi
        
        # Get last reported offset
        local last_offset=0
        if [[ -f "${OFFSET_FILE}" ]]; then
            last_offset=$(grep "^${file_key}:" "${OFFSET_FILE}" | cut -d':' -f2 || echo "0")
        fi
        
        # Get new content if file exists
        local new_lines=""
        local current_offset=0
        
        if [[ -f "$output_file" ]]; then
            current_offset=$(wc -l < "$output_file")
            if (( current_offset > last_offset )); then
                new_lines=$(tail -n "+$((last_offset + 1))" "$output_file" | base64)
            fi
        fi
        
        # Prepare and send report
        local response_code
        
        if [[ -f "$molden_file" ]]; then
            # Report with molden file
            molden_content=$(base64 "$molden_file")
            response_code=$(curl -s -w "%{http_code}" -o /dev/null \
                -X POST "${STATUS_REPORT_ENDPOINT}" \
                -H "Content-Type: application/json" \
                -d @- << EOF
        {
            "filename": "$file_key",
            "status": "$status",
            "new_content": "$new_lines",
            "offset": $current_offset,
            "molden": "$molden_content"
        }
EOF
        )
        else
            # Report without molden file
            response_code=$(curl -s -w "%{http_code}" -o /dev/null \
                -X POST "${STATUS_REPORT_ENDPOINT}" \
                -H "Content-Type: application/json" \
                -d @- << EOF
        {
            "filename": "$file_key",
            "status": "$status",
            "new_content": "$new_lines",
            "offset": $current_offset
        }
EOF
        )
        fi

        # Handle successful report
        if [[ "$response_code" == "204" ]]; then
            # Update offset file if still running
            if [[ "$status" == "RUNNING" ]]; then
                sed -i.bak "/^${file_key}:/d" "${OFFSET_FILE}"
                echo "${file_key}:${current_offset}" >> "${OFFSET_FILE}"
            else
                # Move files to processed directory and cleanup
                mv "$input_file" "$processed_dir/"
                [[ -f "$output_file" ]] && mv "$output_file" "$processed_dir/"
                [[ -f "$molden_file" ]] && mv "$molden_file" "$processed_dir/"
                sed -i.bak "/^${file_key}:/d" "${OFFSET_FILE}"
                rm -f "${OFFSET_FILE}.bak"
            fi
            
            log_message "Successfully reported status $status for $file_key"
        else
            log_message "Failed to report status for $file_key (HTTP $response_code)"
        fi
    done
}

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

        # Initialize offset tracking for the new job
        initialize_offset_tracking "${file_name%.*}.out"
        
        log_message "Starting job execution"

        # Start the job in the background
        mpirun --allow-run-as-root -np 1 "$APP_EXECUTABLE" "$input_file" >> "$LOG_FILE" 2>&1 &
        pid=$!

        disown $pid

        log_message "Job started with PID: $pid"

    else
        # branch logic based on the HTTP response code
        if [[ "$http_code" == "404" ]]; then
            log_message "No new jobs available"
        else
            log_message "No new jobs available or failed to fetch job (HTTP code: $http_code, response: $response)"
        fi
    fi
}

# Main loop to manage job and status reporting
main_loop() {
    while true; do
        # Check if APP is running
        if pgrep -x "$APP_EXECUTABLE" > /dev/null; then
            log_message "$APP_EXECUTABLE is running"
            report_status
        # If APP is not running but has output files, report status
        elif [[ -n $(find "$SHARED_DIR" -maxdepth 1 -name "*.out") ]]; then
            log_message "$APP_EXECUTABLE is not running, but there are output files, reporting and cleaning up..."
            report_status
        else
            log_message "$APP_EXECUTABLE is not running, fetching new job..."
            fetch_new_job
        fi
        # Sleep before the next cycle
        sleep "$STATUS_CHECK_INTERVAL"
    done
}

# Wrapper to restart script in case of failure
while true; do
    main_loop
    log_message "Script crashed. Restarting in 5 seconds..."
    sleep 5
done