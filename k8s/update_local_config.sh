#!/bin/bash

# Function to check if minikube is running correctly
check_minikube() {
  if ! minikube status &>/dev/null; then
    echo "Minikube is not running. Attempting to start..."
    if ! minikube start --driver=docker; then
      echo "Failed to start Minikube. Please check your Minikube installation."
      exit 1
    fi
  fi

  if ! minikube status | grep -q "apiserver: Running"; then
    echo "Minikube API server is not running. Attempting to fix..."
    minikube delete
    if ! minikube start --driver=docker; then
      echo "Failed to start Minikube. Please check your Minikube installation."
      exit 1
    fi
  fi
}

# Check and start Minikube
check_minikube

# Update Minikube context
minikube update-context

# Get Minikube IP
MINIKUBE_IP=$(minikube ip)

# Get certificate paths
CERT_AUTH=$(minikube ssh "sudo cat /var/lib/minikube/certs/ca.crt" | base64 -w0)
CLIENT_CERT=$(minikube ssh "sudo cat /var/lib/minikube/certs/apiserver-kubelet-client.crt" | base64 -w0)
CLIENT_KEY=$(minikube ssh "sudo cat /var/lib/minikube/certs/apiserver-kubelet-client.key" | base64 -w0)

# Create or update config-local file
cat > ~/.kube/config-local << EOF
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${CERT_AUTH}
    server: https://${MINIKUBE_IP}:8443
  name: minikube
contexts:
- context:
    cluster: minikube
    user: minikube
  name: minikube
current-context: minikube
kind: Config
preferences: {}
users:
- name: minikube
  user:
    client-certificate-data: ${CLIENT_CERT}
    client-key-data: ${CLIENT_KEY}
EOF

echo "Local Kubernetes config updated at ~/.kube/config-local"
echo "Please run 'kubectl get pods --all-namespaces' to verify the connection."