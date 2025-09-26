# Hands-On Helm Exercise

## 📌 Goal
Deploy a custom web application using **Helm** on Kubernetes, configure it with `values.yaml`, and manage it with upgrades and rollbacks.

---

## ✅ Prerequisites
- A running **Kubernetes cluster** (e.g., [minikube](https://minikube.sigs.k8s.io/docs/start/)).  
- [Helm installed](https://helm.sh/docs/intro/install/).  
- `kubectl` configured to connect to your cluster.  

Verify setup:
```bash
kubectl cluster-info
helm version
```

---

## 🏗 Step 1: Create a Helm Chart
Generate a new chart:
```bash
helm create my-webapp
```

This creates a directory `my-webapp/` with:
- `Chart.yaml` → chart metadata  
- `values.yaml` → default config values  
- `templates/` → Kubernetes manifest templates  

---

## 🔍 Step 2: Explore the Chart
Open `values.yaml`. Example:
```yaml
replicaCount: 1
image:
  repository: nginx
  tag: stable
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
```

👉 By default, this deploys **Nginx with 1 replica**.

---

## 🚀 Step 3: Install the Chart
Deploy the chart:
```bash
helm install my-release ./my-webapp
```

Check status:
```bash
helm list
kubectl get pods
kubectl get svc
```

---

## ⚙️ Step 4: Customize with `my-values.yaml`
Instead of editing `values.yaml` directly, create a custom `my-values.yaml`:

```yaml
replicaCount: 2

image:
  repository: httpd
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: NodePort
  port: 80

resources:
  limits:
    cpu: 200m
    memory: 128Mi
  requests:
    cpu: 100m
    memory: 64Mi
```

Apply your custom values:
```bash
helm upgrade my-release ./my-webapp -f my-values.yaml
```

Check:
```bash
kubectl get pods
kubectl get svc
```

👉 Now you have **Apache HTTPD with 2 replicas**, exposed as a NodePort.

---

## 📄 Step 5: Add a Custom ConfigMap
Create a file `templates/configmap.yaml` inside your chart:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-html
data:
  index.html: |
    <html>
      <head><title>My Helm WebApp</title></head>
      <body>
        <h1>Hello from Helm! 🚀</h1>
        <p>This page is served using a ConfigMap.</p>
      </body>
    </html>
```

Modify your `deployment.yaml` to mount it:

```yaml
        volumeMounts:
          - name: html
            mountPath: /usr/local/apache2/htdocs/
      volumes:
        - name: html
          configMap:
            name: {{ .Release.Name }}-html
```

Re-deploy:
```bash
helm upgrade my-release ./my-webapp -f my-values.yaml
```

---

## 🔄 Step 6: Rollback
If something breaks:
```bash
helm rollback my-release 1
```

---

## 🧹 Step 7: Uninstall
Clean up:
```bash
helm uninstall my-release
```

---

## 💡 Extra Challenges
1. Change the ConfigMap content and upgrade the release.  
2. Package your chart:
   ```bash
   helm package ./my-webapp
   ```
   and serve it with:
   ```bash
   helm repo index .
   ```
3. Share the chart with teammates via a Helm repo.  

---

## 🎯 Outcome
By completing this lab, you’ll know how to:
- Create, install, and manage Helm charts.  
- Override configurations using `values.yaml`.  
- Serve custom HTML with a ConfigMap.  
- Perform upgrades and rollbacks.  
- Package and share Helm charts.  
