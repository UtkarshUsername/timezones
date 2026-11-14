import { Route, Router, Routes } from "lakebed/client";
import { PlannerApp } from "./planner/planner";
import { PollAuthCallback, PollCreate, PollPage, PollsHome } from "./polls";

export function App() {
  return <Router><Routes><Route path="/" element={<PlannerApp />} /><Route path="/auth/callback" element={<PollAuthCallback />} /><Route path="/polls" element={<PollsHome />} /><Route path="/polls/new" element={<PollCreate />} /><Route path="/polls/:id" element={<PollPage />} /></Routes></Router>;
}
