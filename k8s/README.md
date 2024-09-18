# Andromeda Cluster Simulation Setup

## Overview

This document outlines the process of setting up a local Kubernetes environment to simulate the Andromeda Cluster, and provides instructions for deploying to both local and remote environments.

## Prerequisites

- kubectl (Kubernetes command-line tool)
- minikube (Local Kubernetes cluster)
- docker (Container runtime)
- Two Kubernetes configuration files (naming convention):
  - `~/.kube/config`: For remote Andromeda cluster details (may not exist initially)
  - `~/.kube/config-local`: For local cluster details (will be created by our setup script)

## Kubernetes Manifests

We use manifest files stored in a `manifests` folder. These files use `${KUBE_NAMESPACE}` as a placeholder for the namespace, which will be replaced during deployment.

## Setup Instructions

### Preparing Kubernetes Configurations

1. Ensure you have the Andromeda cluster configuration file in place (if applicable):
   - `~/.kube/config`: Contains remote Andromeda cluster details

2. Create and run the `update_local_config.sh` script:
   This script checks Minikube status, starts it if necessary, and creates a local Kubernetes config file.
   ```
   chmod +x update_local_config.sh
   ./update_local_config.sh
   ```

### Simplifying Context Switching

Add the following aliases to your shell configuration file (e.g., `~/.bashrc` or `~/.zshrc`):

```bash
alias use-local='export KUBECONFIG=~/.kube/config-local'
alias use-andromeda='export KUBECONFIG=~/.kube/config'
```

Reload your shell configuration:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

Now you can switch contexts easily:
- For local development: `use-local`
- For Andromeda cluster: `use-andromeda`

These aliases set the KUBECONFIG environment variable, which kubectl uses to determine which cluster to interact with.

### Handling Different Namespaces

Create and use the `apply_manifests.sh` script:
This script applies Kubernetes manifests to a specified namespace and sets the KUBE_NAMESPACE environment variable.
```
chmod +x apply_manifests.sh
```

## Deployment Instructions

### Local Development Setup

1. Switch to local context:
   ```
   use-local
   ```

2. Update local configuration:
   ```
   ./update_local_config.sh
   ```

3. Apply manifests:
   ```
   ./apply_manifests.sh local-simulation
   ```

4. Verify the deployments and PVC:
   ```
   kubectl get deployments -n $KUBE_NAMESPACE
   kubectl get pods -n $KUBE_NAMESPACE
   kubectl get pvc -n $KUBE_NAMESPACE
   ```

### Deploying to Andromeda Cluster

1. Switch to Andromeda context:
   ```
   use-andromeda
   ```

2. Apply manifests:
   ```
   ./apply_manifests.sh tenant-ac-machine
   ```

3. Verify the deployments and PVC:
   ```
   kubectl get deployments -n $KUBE_NAMESPACE
   kubectl get pods -n $KUBE_NAMESPACE
   kubectl get pvc -n $KUBE_NAMESPACE
   ```

## Accessing Pods and Testing

1. Access the pods:
   ```
   kubectl exec -it $(kubectl get pod -n $KUBE_NAMESPACE -l app=quick-app -o jsonpath="{.items[0].metadata.name}") -n $KUBE_NAMESPACE -- /bin/bash
   kubectl exec -it $(kubectl get pod -n $KUBE_NAMESPACE -l app=disk-access -o jsonpath="{.items[0].metadata.name}") -n $KUBE_NAMESPACE -- /bin/bash
   ```

2. Test shared storage:
   - Create a file in the shared disk from one pod:
     ```
     echo "Hello, shared storage!" > /mnt/shared-disk/test.txt
     ```
   - Verify its existence from the other pod:
     ```
     cat /mnt/shared-disk/test.txt
     ```

## Notes on Namespaces

- In Kubernetes, namespaces provide a mechanism for isolating groups of resources within a single cluster.
- For local development, we use the `local-simulation` namespace to keep our simulation resources separate from other local development work.
- For the Andromeda cluster, we use the `tenant-ac-machine` namespace, which is specifically allocated for your project.
- The `apply_manifests.sh` script sets the `KUBE_NAMESPACE` environment variable, making it easier to run subsequent kubectl commands.

## Notes on Local Simulation vs Andromeda Deployment

- Kubernetes Config: Use `~/.kube/config-local` for local development and `~/.kube/config` for the Andromeda cluster.
- Namespace: Use `local-simulation` for local setup, `tenant-ac-machine` for Andromeda environment.
- GPU simulation: The local environment simulates GPU presence. The Andromeda cluster will have real GPU resources.
- Storage: Local PersistentVolumeClaim may differ from the Andromeda cluster setup.

## Stopping and Cleaning Up the Environment

### Local Environment

1. Stop Minikube:
   ```
   minikube stop
   ```

2. Delete the Minikube cluster (optional, for a complete cleanup):
   ```
   minikube delete
   ```

3. Remove the local Kubernetes config:
   ```
   rm ~/.kube/config-local
   ```

### Andromeda Cluster

To remove deployed resources from the Andromeda cluster:

1. Switch to Andromeda context:
   ```
   use-andromeda
   ```

2. Delete all resources in the namespace:
   ```
   kubectl delete namespace tenant-ac-machine
   ```

### General Troubleshooting Steps

1. Always ensure you're in the correct Kubernetes context:
   - For local development: `use-local`
   - For Andromeda cluster: `use-andromeda`

2. Verify that all required tools (kubectl, minikube, docker) are up to date.

3. If you encounter persistent issues, consider reinstalling Minikube and Docker, ensuring you have the latest stable versions.

## Next Steps

1. Implement a simple job submission and execution process.
2. Test the job submission and execution using the local Kubernetes setup.
3. Refine the setup based on testing results and any differences identified with the actual Andromeda cluster.
4. Develop a comprehensive testing suite to ensure compatibility between local and Andromeda environments.
5. Create a CI/CD pipeline for automated testing and deployment.