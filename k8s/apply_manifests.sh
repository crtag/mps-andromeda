#!/bin/bash

set -e

# Check if a namespace argument is provided
if [ -z "$1" ]; then
  echo "Error: No namespace provided. Usage: ./apply_manifests.sh <namespace>"
  exit 1
fi

export KUBECONFIG=~/.kube/config-microk8s
export KUBE_NAMESPACE="$1"

# Function to apply a manifest file
apply_manifest() {
    local file=$1
    echo "Applying $file..."
    sed "s/\${KUBE_NAMESPACE}/$KUBE_NAMESPACE/g" "$file" | kubectl apply -f -
}

# Function to wait for PVC to be bound with retries
wait_for_pvc() {
    local pvc_name=$1
    local max_retries=10
    local retry_interval=30

    for ((i=1; i<=max_retries; i++)); do
        echo "Attempt $i: Waiting for PVC $pvc_name to be bound..."
        if kubectl get pvc $pvc_name -n ${KUBE_NAMESPACE} -o jsonpath='{.status.phase}' | grep -q "Bound"; then
            echo "PVC $pvc_name is now bound."
            return 0
        fi
        sleep $retry_interval
    done

    echo "Error: PVC $pvc_name did not become bound within the retry limit."
    return 1
}

# Apply manifests in order
manifests=(
    "manifests/01-namespace.yaml"
    "manifests/02-shared-disk-pvc.yaml"
    "manifests/03-disk-access-deployment.yaml"
    "manifests/04-quick-app-deployment.yaml"
)

for manifest in "${manifests[@]}"; do
    apply_manifest "$manifest"
    
    # Wait for PVC to be bound after applying it
    if [[ $manifest == *shared-disk-pvc.yaml ]]; then
        wait_for_pvc "shared-disk"
    fi
done

echo "All manifests applied successfully to namespace: ${KUBE_NAMESPACE}"
echo "KUBE_NAMESPACE environment variable set to: ${KUBE_NAMESPACE}"