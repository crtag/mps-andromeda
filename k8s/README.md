# Development environment setup

The following instruction tested on Ubuntu 22.04.5 LTS

## Single node Kubernetes with MicroK8s

Follow the instructions at https://ubuntu.com/kubernetes/install

Outline of the steps:

```bash
sudo snap install microk8s --classic

sudo usermod -a -G microk8s $USER

sudo chown -f -R $USER ~/.kube

su - $USER
```

You may need to start microk8s with

`microk8s start`

Check the status of the cluster:

`microk8s status --wait-ready`

See the cluster dashboard in a browser:

`microk8s dashboard-proxy`

Install the desktop verion of Nvidia GPU drivers.
It's the best to use the latest version of the drivers from the Nvidia website or the Ubuntu repository.

Enable the Nvidia plugin, use the latest version from https://github.com/NVIDIA/gpu-operator to put the version number in the command below:

`microk8s enable nvidia --gpu-operator-version v24.6.2`

__Note: Known working versions configurations: v24.6.2 / 550.107.02__

Enable storage:

`microk8s enable hostpath-storage`

Create namespace for the application, it can match the destination cluster naming convention:

`microk8s kubectl create namespace tenant-ac-machine`

Create PVC (required only once if it's not deleted during the dev cycle):

`microk8s kubectl apply -f pvc-deployment.yaml`

Deploy Disk Manager (required only for development to emulate production environment):

`microk8s kubectl apply -f disk-deployment.yaml`

Deploy the application:

`microk8s kubectl apply -f configmap.yaml -f app-deployment.yaml`

Useful commands:

```bash
microk8s kubectl get all,pvc -n tenant-ac-machine
microk8s kubectl delete all --all -n tenant-ac-machine
microk8s kubectl delete pvc andromeda-shared-disk -n tenant-ac-machine
```

YAML definitions have defined serviceName so it can be accessed like this:

```bash
microk8s kubectl exec -n tenant-ac-machine -it quick-app-0 -- /bin/bash
microk8s kubectl exec -n tenant-ac-machine -it disk-access-0 -- /bin/bash
```

## Running the application

`mpirun --allow-run-as-root -np 1 quick.cuda.MPI /mnt/shared-disk/water.in`
