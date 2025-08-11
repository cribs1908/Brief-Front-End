import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Run every 15 minutes to catch scheduled windows
crons.interval("run-automations", { minutes: 15 }, api.automations.runDueAutomations);

export default crons;


