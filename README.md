# Welcome to Antigravity!

Welcome to your new developer home! Your Firebase Studio project has been successfully migrated to Antigravity.

Antigravity is our next-generation, agent-first IDE designed for high-velocity, autonomous development. Because Antigravity runs locally on your machine, you now have access to powerful local workflows and fully integrated AI editing capabilities that go beyond a cloud-based web IDE.

## Getting Started
- **Run Locally**: Use the **Run and Debug** menu on the left sidebar to start your local development server.
  - Or in a terminal run `npm run dev` and visit `http://localhost:9002`.
- **Deploy**: You can deploy your changes to Firebase App Hosting by using the integrated terminal and standard Firebase CLI commands, just as you did in Firebase Studio.
- **Cleanup**: Cleanup unused artifacts with the @cleanup workflow.

Enjoy the next era of AI-driven development!

File any bugs at https://github.com/firebase/firebase-tools/issues

**Firebase Studio Export Date:** 2026-04-30


---

## Previous README.md contents:



# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Seeding Data and Admin User

This project comes with pre-defined data for buses and routes. It also includes a process to grant administrative privileges to a specific user.

To seed your Firestore database with the necessary data and set the admin user, run the following command:

```bash
npm run seed
```

This single command will:
1.  Populate the database with initial bus data.
2.  Create schedules for the buses for the next 30 days.
3.  Attempt to grant the 'admin' role to the user `clubanandtravel@gmail.com`.

**Important**: For the admin role to be granted successfully, you must ensure you have logged into the application with the email `clubanandtravel@gmail.com` at least once *before* running the `seed` command. If the user doesn't exist in Firebase Authentication, the script will not be able to assign the role.
