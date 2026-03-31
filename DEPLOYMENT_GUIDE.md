# BusHive Deployment Guide

This guide will help you make your app accessible to everyone via a public link.

## Option 1: Permanent Link (Firebase App Hosting) - Recommended

Firebase App Hosting is the modern way to host Next.js apps. It automatically builds and deploys your app whenever you push code to GitHub.

### Step 1: Push your code to GitHub
1.  Go to [GitHub](https://github.com/new) and create a new repository (e.g., `bushive`).
2.  In your terminal, run these commands:
    ```bash
    git remote add origin https://github.com/YOUR_USERNAME/bushive.git
    git branch -M main
    git add .
    git commit -m "Initial commit"
    git push -u origin main
    ```

### Step 2: Connect to Firebase
1.  Go to the [Firebase Console](https://console.firebase.google.com/project/studio-8814279733-66d34/apphosting).
2.  Click **"Get started"** or **"Create a backend"**.
3.  Connect your GitHub account and select your repository.
4.  Follow the prompts to finish the setup. Firebase will give you a permanent URL like `https://your-app-id.web.app`.

---

## Option 2: Temporary Link (Ngrok) - Quickest

If you just want to share your screen/app for a few hours while developing, you can use a tunnel.

1.  **Install Ngrok:** Download it from [ngrok.com](https://ngrok.com/download) or run:
    ```bash
    npm install -g ngrok
    ```
2.  **Start your app:**
    ```bash
    npm run dev
    ```
3.  **Start the tunnel (in a new terminal):**
    ```bash
    ngrok http 3000
    ```
4.  Ngrok will provide a "Forwarding" URL (e.g., `https://random-id.ngrok-free.app`) that anyone can use to see your local app.
