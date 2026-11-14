import { Route, Router, Routes } from "lakebed/client";
import { PlannerApp } from "./planner/planner";
import { PollAuthCallback } from "./polls/session";
import { PollCreate } from "./polls/create";
import { PollPage } from "./polls/page";
import { PollsHome } from "./polls/home";

export function App() {
  return <Router><Routes><Route path="/" element={<PlannerApp />} /><Route path="/auth/callback" element={<PollAuthCallback />} /><Route path="/polls" element={<PollsHome />} /><Route path="/polls/new" element={<PollCreate />} /><Route path="/polls/:id" element={<PollPage />} /></Routes></Router>;
}
