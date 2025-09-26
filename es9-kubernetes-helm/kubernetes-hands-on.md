# Kubernetes Hands-On Lab (Local Setup)

This guide walks you through running a simple Kubernetes exercise
**locally** using either **Minikube** (recommended) or **Docker
Desktop's built-in Kubernetes**.

------------------------------------------------------------------------

## Option A) Run with Minikube (Recommended)

### 0) Prerequisites

-   Install **Docker** (or another VM driver).
-   Install **kubectl**.
-   Install **minikube**.

### 1) Start a Local Cluster

``` bash
minikube start
kubectl config use-context minikube
kubectl get nodes
```

### 2) Create a Deployment

``` bash
kubectl create deployment webserver --image=nginx
kubectl get deployments
kubectl get pods -o wide
```

### 3) Expose the Deployment

``` bash
kubectl expose deployment webserver --type=NodePort --port=80
kubectl get services webserver
```

### 4) Access the Application

**Auto-open in browser:**

``` bash
minikube service webserver
```

**Or manually via NodePort:**

``` bash
minikube ip
kubectl get svc webserver -o jsonpath='{.spec.ports[0].nodePort}'; echo
# then open http://<minikube-ip>:<nodePort>
```

**Alternative (Port-forward):**

``` bash
kubectl port-forward svc/webserver 8080:80
# open http://localhost:8080
```

### 5) Scale the Deployment

``` bash
kubectl scale deployment webserver --replicas=3
kubectl get pods -w
```

### 6) Clean Up

``` bash
kubectl delete all --all
minikube delete
```

------------------------------------------------------------------------

## Option B) Run with Docker Desktop Kubernetes

1.  Enable Kubernetes in Docker Desktop:
    -   Go to **Settings → Kubernetes → Enable Kubernetes → Apply &
        Restart**.
2.  Verify cluster:

``` bash
kubectl config current-context
kubectl get nodes
```

3.  Use the same commands as in **Step 2--5** above.
4.  For access, prefer port-forward:

``` bash
kubectl port-forward svc/webserver 8080:80
# open http://localhost:8080
```

------------------------------------------------------------------------

## Common Issues & Fixes

-   **Pods pending**: wait until `kubectl get nodes` shows STATUS=Ready.
-   **Image pull back-off**: use a tagged image, e.g. `nginx:1.25`.
-   **Can't reach NodePort** (Docker Desktop): use
    `kubectl port-forward` instead.
-   **Cleanup stuck**: usually `kubectl delete all --all` is enough.

------------------------------------------------------------------------

✅ After completing this lab, you'll know how to: - Create a
deployment - Expose it as a service - Scale replicas - Perform cleanup
