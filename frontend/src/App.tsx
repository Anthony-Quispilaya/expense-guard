import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import LinkedAccounts from "./pages/LinkedAccounts";
import LinkAccounts from "./pages/LinkAccounts";
import SimulateExpense from "./pages/SimulateExpense";
import DemoControls from "./pages/DemoControls";
import ReviewQueue from "./pages/ReviewQueue";
import PolicySettings from "./pages/PolicySettings";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/link" element={<LinkAccounts />} />
          <Route path="/simulate" element={<SimulateExpense />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/accounts" element={<LinkedAccounts />} />
          <Route path="/demo" element={<DemoControls />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/policy" element={<PolicySettings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
