

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
