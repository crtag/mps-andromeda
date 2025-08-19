
```
microk8s kubectl create secret docker-registry mps-registry-secret \
  --docker-server=code.mps.inc \
  --docker-username=alexey \
  --docker-password=______ \
  --docker-email=alexey@machinephase.systems \
  --namespace=tenant-ac-machine
```
