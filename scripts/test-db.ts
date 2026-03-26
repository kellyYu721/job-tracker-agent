import { addApplication, listApplications } from "../src/lib/applications";

async function run() {
  await addApplication({
    company: "Stripe",
    role: "Software Engineer",
    location: "San Francisco",
  });

  const apps = await listApplications();
  console.log(apps);
}

run();
